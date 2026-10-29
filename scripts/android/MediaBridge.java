package app.rozh.player;

/*
 * ROZH Player — device media index bridge.
 *
 * The phone and Android TV builds must show everything already on the device,
 * on every launch, without the user picking files one by one. That needs two
 * Android APIs that do not exist on the web side:
 *
 *   1. MediaStore — the system index of every video/audio file on the device.
 *   2. The Storage Access Framework — a folder picker that can be persisted
 *      across launches (ACTION_OPEN_DOCUMENT_TREE + takePersistableUriPermission).
 *
 * Neither can be reached from the webview, so this class runs inside the app
 * process and talks to the Rust side through a tiny file mailbox:
 *
 *     MediaBridge.java  ◀── command.json   (written by Rust: {"cmd":"scan",…})
 *                       ──▶ state.json     (read by Rust, then by the UI)
 *
 * No JNI, no reflection, no binder: a 300 ms poll of a two-frame file.
 * Every entry point is defensive — a media scanner must never take the player
 * down with it.
 */

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Size;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class MediaBridge {

    private static final String TAG = "RozhMedia";
    private static final String DIR = "rozh-media";
    private static final long POLL_MS = 300;
    private static final int REQ_PERMS = 0x52A1;
    private static final int REQ_TREE = 0x52A2;
    private static final int MAX_ITEMS = 20000;
    private static final int MAX_FOLDER_DEPTH = 8;
    private static final int MAX_THUMBS = 160;

    private static Activity activity;
    private static File workDir;
    private static volatile int lastToken = -1;
    private static volatile boolean busy;
    private static volatile boolean askingPermissions;
    /** Port of the loopback media server (0 = not running). */
    private static volatile int serverPort;
    private static volatile long downloadId = -1L;
    private static final Object LOCK = new Object();

    private MediaBridge() {}

    /* ------------------------------------------------------------------ */
    /* lifecycle                                                          */
    /* ------------------------------------------------------------------ */

    /** Called from MainActivity.onCreate — starts the mailbox worker. */
    public static void attach(Activity a) {
        if (a == null || activity != null) return;
        activity = a;
        try {
            workDir = new File(a.getCacheDir(), DIR);
            if (!workDir.exists() && !workDir.mkdirs()) {
                workDir = new File(a.getFilesDir(), DIR);
                workDir.mkdirs();
            }
        } catch (Throwable t) {
            return;
        }
        writeHello();
        startMediaServer();
        if (!new File(workDir, "state.json").exists()) {
            JSONObject idle = new JSONObject();
            try {
                idle.put("state", "idle");
                idle.put("count", 0);
            } catch (Throwable ignored) {
                /* never happens */
            }
            writeState(idle);
        }
        Thread worker = new Thread(new Runnable() {
            @Override
            public void run() {
                loop();
            }
        }, "rozh-media-bridge");
        worker.setDaemon(true);
        worker.start();
    }

    private static void writeHello() {
        try {
            JSONObject o = new JSONObject();
            o.put("pkg", activity.getPackageName());
            o.put("cacheDir", activity.getCacheDir().getAbsolutePath());
            o.put("filesDir", activity.getFilesDir().getAbsolutePath());
            o.put("workDir", workDir.getAbsolutePath());
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("bridge", 1);
            writeFile(new File(workDir, "hello.json"), o.toString());
        } catch (Throwable ignored) {
            /* discovery is a nicety, not a requirement */
        }
    }

    private static void loop() {
        while (true) {
            try {
                Thread.sleep(POLL_MS);
                File cmdFile = new File(workDir, "command.json");
                if (!cmdFile.isFile()) continue;
                String raw = readFile(cmdFile);
                if (raw == null || raw.length() == 0) continue;
                JSONObject cmd;
                try {
                    cmd = new JSONObject(raw);
                } catch (Throwable bad) {
                    continue;
                }
                int token = cmd.optInt("token", 0);
                if (token == lastToken) continue;
                lastToken = token;
                String name = cmd.optString("cmd", "");
                boolean audio = cmd.optBoolean("audio", true);
                if ("scan".equals(name)) {
                    scan(audio);
                } else if ("pick".equals(name)) {
                    pickFolder();
                } else if ("play".equals(name)) {
                    play(cmd.optString("uri", ""), cmd.optString("mime", "video/*"));
                } else if ("install".equals(name)) {
                    install(cmd.optString("url", ""));
                }
            } catch (InterruptedException stop) {
                return;
            } catch (Throwable t) {
                fail("worker", t);
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* permissions                                                        */
    /* ------------------------------------------------------------------ */

    private static String[] wanted(boolean audio) {
        if (Build.VERSION.SDK_INT >= 33) {
            // literal names on purpose: they must not depend on compileSdk
            return audio
                ? new String[] { "android.permission.READ_MEDIA_VIDEO", "android.permission.READ_MEDIA_AUDIO" }
                : new String[] { "android.permission.READ_MEDIA_VIDEO" };
        }
        return new String[] { "android.permission.READ_EXTERNAL_STORAGE" };
    }

    private static boolean granted(Activity a, boolean audio) {
        try {
            for (String p : wanted(audio)) {
                if (a.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) return false;
            }
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    private static void askPermissions(final boolean audio) {
        if (askingPermissions) return;
        askingPermissions = true;
        final Activity a = activity;
        if (a == null) {
            askingPermissions = false;
            fail("permissions", new IllegalStateException("no activity"));
            return;
        }
        a.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    a.requestPermissions(wanted(audio), REQ_PERMS);
                } catch (Throwable t) {
                    askingPermissions = false;
                    fail("permissions", t);
                }
            }
        });
    }

    /** Forwarded from MainActivity.onRequestPermissionsResult. */
    public static void onPermissions(int requestCode, int[] grantResults) {
        if (requestCode != REQ_PERMS) return;
        askingPermissions = false;
        boolean ok = grantResults != null && grantResults.length > 0;
        if (ok) {
            for (int r : grantResults) {
                if (r != PackageManager.PERMISSION_GRANTED) {
                    ok = false;
                    break;
                }
            }
        }
        if (!ok) {
            writeDenied();
            return;
        }
        startScanThread();
    }

    /* ------------------------------------------------------------------ */
    /* scanning                                                           */
    /* ------------------------------------------------------------------ */

    private static void scan(final boolean audio) {
        Activity a = activity;
        if (a == null) {
            fail("scan", new IllegalStateException("no activity"));
            return;
        }
        if (!granted(a, audio)) {
            JSONObject o = new JSONObject();
            try {
                o.put("state", "permission");
                o.put("count", 0);
            } catch (Throwable ignored) {
                /* never happens */
            }
            writeState(o);
            askPermissions(audio);
            return;
        }
        startScanThread();
    }

    private static void startScanThread() {
        if (busy) return;
        busy = true;
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    doScan();
                } catch (Throwable err) {
                    fail("scan", err);
                } finally {
                    busy = false;
                }
            }
        }, "rozh-media-scan");
        t.setDaemon(true);
        t.start();
    }

    private static void doScan() {
        final Activity a = activity;
        if (a == null) return;
        writeStateHeader("scanning");

        List<JSONObject> items = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        collect(items, seen, movieCollection(), true);
        collect(items, seen, songCollection(), true);

        // folders the user picked earlier stay part of the library
        for (String tree : pickedTrees()) {
            try {
                collectTree(a, Uri.parse(tree), items, seen);
            } catch (Throwable ignored) {
                /* a revoked grant must not kill the rest of the scan */
            }
        }

        if (items.size() > MAX_ITEMS) {
            items = new ArrayList<>(items.subList(0, MAX_ITEMS));
        }
        JSONObject out = new JSONObject();
        try {
            out.put("state", "ready");
            out.put("ts", System.currentTimeMillis());
            out.put("count", items.size());
            out.put("permission", "granted");
            JSONArray arr = new JSONArray();
            for (JSONObject it : items) arr.put(it);
            out.put("items", arr);
        } catch (Throwable ignored) {
            /* never happens */
        }
        writeState(out);
    }

    private static Uri movieCollection() {
        if (Build.VERSION.SDK_INT >= 29) {
            return MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL);
        }
        return MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
    }

    private static Uri songCollection() {
        if (Build.VERSION.SDK_INT >= 29) {
            return MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL);
        }
        return MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
    }

    private static void collect(List<JSONObject> out, Set<String> seen, Uri collection, boolean thumbs) {
        Activity a = activity;
        if (a == null) return;
        Cursor c = null;
        try {
            c = a.getContentResolver().query(collection, null, null, null, null);
            if (c == null) return;
            int iId = column(c, "_id");
            int iName = column(c, "_display_name", "display_name");
            int iSize = column(c, "_size");
            int iDur = column(c, "duration");
            int iMime = column(c, "mime_type");
            int iAdded = column(c, "date_added");
            int iBucket = column(c, "bucket_display_name");
            int iPath = column(c, "relative_path");
            int iMod = column(c, "date_modified");
            int guard = 0;
            while (c.moveToNext() && out.size() < MAX_ITEMS && guard < MAX_ITEMS) {
                guard += 1;
                try {
                    if (iId < 0) continue;
                    long id = c.getLong(iId);
                    Uri uri = ContentUris.withAppendedId(collection, id);
                    String key = uri.toString();
                    if (!seen.add(key)) continue;
                    String name = iName >= 0 ? c.getString(iName) : null;
                    if (name == null || name.length() == 0) name = "media-" + id;
                    String mime = iMime >= 0 ? c.getString(iMime) : "";
                    boolean isAudio = mime != null && mime.startsWith("audio/");
                    JSONObject o = baseItem(name, uri.toString(), isAudio ? "audio" : "video");
                    o.put("size", iSize >= 0 ? c.getLong(iSize) : 0L);
                    long dur = iDur >= 0 ? c.getLong(iDur) : 0L;
                    o.put("duration", dur > 0 ? dur : 0L);
                    o.put("mime", mime == null ? "" : mime);
                    o.put("added", iAdded >= 0 ? c.getLong(iAdded) * 1000L : 0L);
                    o.put("modified", iMod >= 0 ? c.getLong(iMod) * 1000L : 0L);
                    String bucket = iBucket >= 0 ? c.getString(iBucket) : null;
                    if (bucket == null && iPath >= 0) bucket = c.getString(iPath);
                    if (bucket != null) o.put("bucket", bucket);
                    if (thumbs && !isAudio && out.size() < MAX_THUMBS) {
                        String thumb = makeThumb(uri, id, "ms");
                        if (thumb != null) o.put("thumb", thumb);
                    }
                    out.add(o);
                } catch (Throwable ignored) {
                    /* one broken row must not stop the scan */
                }
            }
        } catch (Throwable ignored) {
            /* no permission yet, or the provider is busy */
        } finally {
            if (c != null) {
                try {
                    c.close();
                } catch (Throwable ignored) {
                    /* ignore */
                }
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* folder picker (SAF)                                                */
    /* ------------------------------------------------------------------ */

    private static void pickFolder() {
        final Activity a = activity;
        if (a == null) {
            fail("pick", new IllegalStateException("no activity"));
            return;
        }
        writeStateHeader("picking");
        a.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                    a.startActivityForResult(intent, REQ_TREE);
                } catch (Throwable t) {
                    fail("pick", t);
                }
            }
        });
    }

    /** Forwarded from MainActivity.onActivityResult. */
    public static void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_TREE) return;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            writeStateHeader("cancelled");
            return;
        }
        final Uri tree = data.getData();
        final Activity a = activity;
        if (a == null) return;
        try {
            a.getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Throwable ignored) {
            /* some providers refuse, the grant is still valid this session */
        }
        addPickedTree(tree.toString());
        writeStateHeader("scanning");
        if (busy) return;
        busy = true;
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    doScan();
                } catch (Throwable err) {
                    fail("folder", err);
                } finally {
                    busy = false;
                }
            }
        }, "rozh-media-folder");
        t.setDaemon(true);
        t.start();
    }

    private static SharedPreferences prefs() {
        return activity.getSharedPreferences("rozh-mediastore", Context.MODE_PRIVATE);
    }

    private static void addPickedTree(String uri) {
        try {
            SharedPreferences p = prefs();
            Set<String> trees = new HashSet<>(p.getStringSet("trees", new HashSet<String>()));
            trees.add(uri);
            p.edit().putStringSet("trees", trees).apply();
        } catch (Throwable ignored) {
            /* ignore */
        }
    }

    private static List<String> pickedTrees() {
        try {
            return new ArrayList<>(prefs().getStringSet("trees", new HashSet<String>()));
        } catch (Throwable t) {
            return new ArrayList<>();
        }
    }

    /** Walk a SAF tree and add every media document to the list. */
    private static void collectTree(Activity a, Uri tree, List<JSONObject> out, Set<String> seen) {
        String rootId;
        try {
            rootId = DocumentsContract.getTreeDocumentId(tree);
        } catch (Throwable t) {
            return;
        }
        List<String> level = new ArrayList<>();
        level.add(rootId);
        int depth = 0;
        while (!level.isEmpty() && depth < MAX_FOLDER_DEPTH && out.size() < MAX_ITEMS) {
            List<String> next = new ArrayList<>();
            for (String docId : level) {
                if (out.size() >= MAX_ITEMS) break;
                Cursor c = null;
                try {
                    Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId);
                    c = a.getContentResolver().query(
                        children,
                        new String[] {
                            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                            DocumentsContract.Document.COLUMN_MIME_TYPE,
                            DocumentsContract.Document.COLUMN_SIZE,
                            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
                        },
                        null, null, null);
                    if (c == null) continue;
                    while (c.moveToNext()) {
                        try {
                            String childId = c.getString(0);
                            String name = c.getString(1);
                            String mime = c.getString(2);
                            long size = c.getLong(3);
                            long mod = c.getLong(4);
                            if (mime != null && mime.startsWith("vnd.android.document/directory")) {
                                if (next.size() < 400) next.add(childId);
                                continue;
                            }
                            boolean video = mime != null && mime.startsWith("video/");
                            boolean audio = mime != null && mime.startsWith("audio/");
                            if (!video && !audio && !looksLikeMedia(name)) continue;
                            Uri child = DocumentsContract.buildDocumentUriUsingTree(tree, childId);
                            String key = child.toString();
                            if (!seen.add(key)) continue;
                            JSONObject o = baseItem(name, key, audio ? "audio" : "video");
                            o.put("size", size);
                            o.put("duration", 0L);
                            o.put("mime", mime == null ? "" : mime);
                            o.put("added", mod);
                            o.put("bucket", "Folder");
                            o.put("folder", true);
                            out.add(o);
                        } catch (Throwable ignored) {
                            /* skip the row */
                        }
                    }
                } catch (Throwable ignored) {
                    /* skip the directory */
                } finally {
                    if (c != null) {
                        try {
                            c.close();
                        } catch (Throwable ignored) {
                            /* ignore */
                        }
                    }
                }
            }
            level = next;
            depth += 1;
        }
    }

    private static boolean looksLikeMedia(String name) {
        if (name == null) return false;
        String n = name.toLowerCase();
        String[] exts = {
            ".mp4", ".mkv", ".webm", ".avi", ".mov", ".m4v", ".ts", ".m2ts", ".mpg", ".mpeg",
            ".flv", ".wmv", ".3gp", ".ogv", ".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg",
            ".opus", ".wma", ".mka", ".alac",
        };
        for (String e : exts) {
            if (n.endsWith(e)) return true;
        }
        return false;
    }

    /* ------------------------------------------------------------------ */
    /* thumbnails                                                         */
    /* ------------------------------------------------------------------ */

    private static String makeThumb(Uri uri, long id, String tag) {
        if (Build.VERSION.SDK_INT < 29) return null;
        Activity a = activity;
        if (a == null) return null;
        try {
            File dir = new File(workDir, "thumbs");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File outFile = new File(dir, tag + "-" + id + ".jpg");
            if (outFile.isFile() && outFile.length() > 512) return outFile.getAbsolutePath();
            if (dir.list() != null && dir.list().length > MAX_THUMBS * 2) return null;
            Bitmap bmp = a.getContentResolver().loadThumbnail(uri, new Size(384, 216), null);
            if (bmp == null) return null;
            OutputStream os = null;
            try {
                os = new FileOutputStream(outFile);
                bmp.compress(Bitmap.CompressFormat.JPEG, 76, os);
                os.flush();
            } finally {
                if (os != null) os.close();
                bmp.recycle();
            }
            return outFile.getAbsolutePath();
        } catch (Throwable t) {
            return null;
        }
    }

    /* ------------------------------------------------------------------ */
    /* loopback media server                                              */
    /* ------------------------------------------------------------------ */
    /*
     * A content:// URI is readable by the app but not by <video src> on every
     * Android WebView, and it cannot be fetched by hls.js / mpegts.js at all.
     * This tiny HTTP server (127.0.0.1, random port) turns any URI the app can
     * open into a normal http:// source with Range support, which is what both
     * the native player and the MSE-based engines expect.
     *
     *   GET /s/<base64url(uri)>     200 / 206 with Accept-Ranges: bytes
     */

    private static void startMediaServer() {
        try {
            ServerSocket socket = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
            serverPort = socket.getLocalPort();
            Thread t = new Thread(new Runnable() {
                @Override
                public void run() {
                    acceptLoop(socket);
                }
            }, "rozh-media-server");
            t.setDaemon(true);
            t.start();
            JSONObject o = new JSONObject();
            o.put("port", serverPort);
            writeFile(new File(workDir, "server.json"), o.toString());
        } catch (Throwable ignored) {
            /* no server: the UI falls back to content:// URIs */
        }
    }

    private static void acceptLoop(ServerSocket server) {
        while (!server.isClosed()) {
            try {
                final Socket client = server.accept();
                Thread t = new Thread(new Runnable() {
                    @Override
                    public void run() {
                        serve(client);
                    }
                }, "rozh-media-conn");
                t.setDaemon(true);
                t.start();
            } catch (Throwable stopped) {
                return;
            }
        }
    }

    private static void serve(Socket client) {
        InputStream raw = null;
        OutputStream out = null;
        try {
            client.setSoTimeout(20000);
            raw = client.getInputStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(raw, "ISO-8859-1"));
            String requestLine = reader.readLine();
            if (requestLine == null) return;
            String rangeHeader = null;
            String line;
            int guard = 0;
            while ((line = reader.readLine()) != null && line.length() > 0 && guard++ < 64) {
                int colon = line.indexOf(':');
                if (colon > 0) {
                    String key = line.substring(0, colon).trim().toLowerCase();
                    if (key.equals("range")) rangeHeader = line.substring(colon + 1).trim();
                }
            }
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            String path = parts[1];
            out = new BufferedOutputStream(client.getOutputStream(), 64 * 1024);

            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);
            if (!path.startsWith("/s/")) {
                writeSimple(out, 404, "not found");
                return;
            }
            // /s/<base64url(uri)>/<file name> — the name keeps the extension in
            // the URL so the player still recognises the container.
            String rest = path.substring(3);
            int slash = rest.indexOf('/');
            String token = slash >= 0 ? rest.substring(0, slash) : rest;
            String uriText;
            try {
                byte[] decoded = Base64.decode(token, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
                uriText = new String(decoded, "UTF-8");
            } catch (Throwable bad) {
                writeSimple(out, 400, "bad token");
                return;
            }

            Uri uri = Uri.parse(uriText);
            String mime = null;
            long total = -1;
            try {
                mime = activity.getContentResolver().getType(uri);
            } catch (Throwable ignored) {
                /* guess below */
            }
            try {
                android.content.res.AssetFileDescriptor afd = activity.getContentResolver().openAssetFileDescriptor(uri, "r");
                if (afd != null) {
                    total = afd.getLength();
                    afd.close();
                }
            } catch (Throwable ignored) {
                /* unknown length */
            }
            if (mime == null || mime.length() == 0) mime = guessMime(uriText);

            long start = 0;
            long end = -1;
            boolean ranged = false;
            if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
                String spec = rangeHeader.substring(6).split(",")[0].trim();
                int dash = spec.indexOf('-');
                if (dash >= 0) {
                    String from = spec.substring(0, dash).trim();
                    String to = spec.substring(dash + 1).trim();
                    try {
                        if (from.length() == 0) {
                            // suffix range: last N bytes
                            long n = Long.parseLong(to);
                            if (total > 0 && n > 0) {
                                start = Math.max(0, total - n);
                                ranged = true;
                            }
                        } else {
                            start = Long.parseLong(from);
                            ranged = true;
                        }
                        if (to.length() > 0 && start > 0) end = Long.parseLong(to);
                        else if (to.length() > 0) end = Long.parseLong(to);
                    } catch (Throwable ignored) {
                        ranged = false;
                    }
                }
            }
            if (ranged && total > 0) {
                if (start < 0) start = 0;
                if (start >= total) {
                    writeSimple(out, 416, "range not satisfiable");
                    return;
                }
                if (end < 0 || end >= total) end = total - 1;
                long length = end - start + 1;
                StringBuilder head = new StringBuilder();
                head.append("HTTP/1.1 206 Partial Content\r\n");
                head.append("Content-Type: ").append(mime).append("\r\n");
                head.append("Accept-Ranges: bytes\r\n");
                head.append("Content-Range: bytes ").append(start).append('-').append(end).append('/').append(total).append("\r\n");
                head.append("Content-Length: ").append(length).append("\r\n");
                head.append("Connection: close\r\n\r\n");
                out.write(head.toString().getBytes("ISO-8859-1"));
                if (!"HEAD".equals(method)) copyRange(uri, out, start, length);
                out.flush();
                return;
            }

            StringBuilder head = new StringBuilder();
            head.append("HTTP/1.1 200 OK\r\n");
            head.append("Content-Type: ").append(mime).append("\r\n");
            head.append("Accept-Ranges: bytes\r\n");
            if (total > 0) head.append("Content-Length: ").append(total).append("\r\n");
            head.append("Connection: close\r\n\r\n");
            out.write(head.toString().getBytes("ISO-8859-1"));
            if (!"HEAD".equals(method)) copyRange(uri, out, 0, -1);
            out.flush();
        } catch (Throwable ignored) {
            /* a browser that closes early is not an error */
        } finally {
            try {
                if (out != null) out.flush();
            } catch (Throwable ignored) {
                /* ignore */
            }
            try {
                client.close();
            } catch (Throwable ignored) {
                /* ignore */
            }
        }
    }

    private static void copyRange(Uri uri, OutputStream out, long start, long length) throws Exception {
        InputStream in = null;
        try {
            in = activity.getContentResolver().openInputStream(uri);
            if (in == null) return;
            long skipped = 0;
            while (skipped < start) {
                long step = in.skip(start - skipped);
                if (step <= 0) {
                    // skip() may refuse; read and drop instead
                    if (in.read() < 0) return;
                    skipped += 1;
                } else {
                    skipped += step;
                }
            }
            byte[] buf = new byte[64 * 1024];
            long left = length;
            while (true) {
                int want = buf.length;
                if (left >= 0) {
                    if (left <= 0) break;
                    want = (int) Math.min(buf.length, left);
                }
                int read = in.read(buf, 0, want);
                if (read <= 0) break;
                out.write(buf, 0, read);
                if (left > 0) left -= read;
            }
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (Throwable ignored) {
                    /* ignore */
                }
            }
        }
    }

    private static void writeSimple(OutputStream out, int code, String body) throws Exception {
        byte[] bytes = body.getBytes("UTF-8");
        String head = "HTTP/1.1 " + code + " Error\r\nContent-Type: text/plain\r\nContent-Length: "
            + bytes.length + "\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes("ISO-8859-1"));
        out.write(bytes);
        out.flush();
    }

    private static String guessMime(String path) {
        String lower = path.toLowerCase();
        if (lower.contains(".mp4") || lower.contains(".m4v")) return "video/mp4";
        if (lower.contains(".webm")) return "video/webm";
        if (lower.contains(".mkv")) return "video/x-matroska";
        if (lower.contains(".ts") || lower.contains(".m2ts")) return "video/mp2t";
        if (lower.contains(".m3u8")) return "application/vnd.apple.mpegurl";
        if (lower.contains(".mp3")) return "audio/mpeg";
        if (lower.contains(".m4a") || lower.contains(".aac")) return "audio/mp4";
        if (lower.contains(".flac")) return "audio/flac";
        if (lower.contains(".wav")) return "audio/wav";
        if (lower.contains(".ogg") || lower.contains(".opus")) return "audio/ogg";
        return "application/octet-stream";
    }

    /** Hand a media URI to the device's own player or to VLC if it is installed. */
    private static void play(final String uri, final String mime) {
        final Activity a = activity;
        if (a == null || uri == null || uri.length() == 0) return;
        a.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(Uri.parse(uri), mime);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    a.startActivity(intent);
                } catch (Throwable t) {
                    try {
                        Intent plain = new Intent(Intent.ACTION_VIEW);
                        plain.setData(Uri.parse(uri));
                        a.startActivity(plain);
                    } catch (Throwable ignored) {
                        /* nothing can open it */
                    }
                }
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* self update (APK)                                                  */
    /* ------------------------------------------------------------------ */

    private static void writeUpdate(String state, int progress, String message) {
        JSONObject o = new JSONObject();
        try {
            o.put("state", state);
            o.put("progress", progress);
            o.put("ts", System.currentTimeMillis());
            if (message != null) o.put("message", message);
        } catch (Throwable ignored) {
            /* never happens */
        }
        if (workDir == null) return;
        try {
            writeFile(new File(workDir, "update.json"), o.toString());
        } catch (Throwable ignored) {
            /* ignore */
        }
    }

    /** Download an APK with the system download manager, then open the installer. */
    private static void install(String url) {
        final Activity a = activity;
        if (a == null) {
            writeUpdate("error", 0, "no-activity");
            return;
        }
        if (url == null || url.length() == 0) {
            writeUpdate("error", 0, "no-url");
            return;
        }
        try {
            if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
                writeUpdate("permission", 0, "allow installs");
                a.runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                            intent.setData(Uri.parse("package:" + a.getPackageName()));
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            a.startActivity(intent);
                        } catch (Throwable ignored) {
                            /* the user can grant it by hand */
                        }
                    }
                });
                return;
            }
            DownloadManager dm = (DownloadManager) a.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                writeUpdate("error", 0, "no download manager");
                return;
            }
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("ROZH Player update");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalFilesDir(a, Environment.DIRECTORY_DOWNLOADS, "rozh-player-update.apk");
            downloadId = dm.enqueue(request);
            writeUpdate("downloading", 0, null);
            pollDownload(dm, downloadId);
        } catch (Throwable t) {
            writeUpdate("error", 0, String.valueOf(t.getMessage()));
        }
    }

    private static void pollDownload(final DownloadManager dm, final long id) {
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                while (true) {
                    try {
                        Thread.sleep(700);
                        DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
                        Cursor c = dm.query(query);
                        if (c == null) return;
                        if (!c.moveToFirst()) {
                            c.close();
                            return;
                        }
                        int status = c.getInt(c.getColumnIndex(DownloadManager.COLUMN_STATUS));
                        long soFar = c.getLong(c.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                        long total = c.getLong(c.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                        c.close();
                        if (status == DownloadManager.STATUS_SUCCESSFUL) {
                            writeUpdate("installing", 100, null);
                            openInstaller(dm, id);
                            return;
                        }
                        if (status == DownloadManager.STATUS_FAILED) {
                            writeUpdate("error", 0, "download failed");
                            return;
                        }
                        int pct = total > 0 ? (int) Math.min(99, soFar * 100 / total) : 0;
                        writeUpdate("downloading", pct, null);
                    } catch (InterruptedException stop) {
                        return;
                    } catch (Throwable t) {
                        writeUpdate("error", 0, String.valueOf(t.getMessage()));
                        return;
                    }
                }
            }
        }, "rozh-update");
        t.setDaemon(true);
        t.start();
    }

    private static void openInstaller(DownloadManager dm, long id) {
        final Activity a = activity;
        if (a == null) {
            writeUpdate("error", 0, "no-activity");
            return;
        }
        File apk = new File(a.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "rozh-player-update.apk");
        if (!apk.exists()) {
            writeUpdate("error", 0, "no apk");
            return;
        }
        final Uri uri;
        try {
            // file:// URIs are rejected by the installer on Android 7+, so the
            // app writes the APK to its own external files dir and exposes it
            // through the FileProvider declared in the manifest.
            uri = FileProvider.getUriForFile(a, a.getPackageName() + ".fileprovider", apk);
        } catch (Throwable t) {
            writeUpdate("error", 0, String.valueOf(t.getMessage()));
            return;
        }
        writeUpdate("installing", 100, null);
        a.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(uri, "application/vnd.android.package-archive");
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    a.startActivity(intent);
                } catch (Throwable t) {
                    writeUpdate("error", 0, String.valueOf(t.getMessage()));
                }
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* json plumbing                                                      */
    /* ------------------------------------------------------------------ */

    private static JSONObject baseItem(String name, String uri, String kind) throws Exception {
        JSONObject o = new JSONObject();
        o.put("name", name);
        o.put("title", stripExtension(name));
        o.put("uri", uri);
        o.put("kind", kind);
        o.put("ext", extension(name));
        return o;
    }

    private static String stripExtension(String name) {
        if (name == null) return "media";
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private static String extension(String name) {
        if (name == null) return "";
        int dot = name.lastIndexOf('.');
        return dot >= 0 && dot < name.length() - 1 ? name.substring(dot + 1).toLowerCase() : "";
    }

    private static int column(Cursor c, String... names) {
        for (String n : names) {
            int i = c.getColumnIndex(n);
            if (i >= 0) return i;
        }
        return -1;
    }

    private static void writeStateHeader(String state) {
        JSONObject o = new JSONObject();
        try {
            o.put("state", state);
            o.put("count", 0);
            o.put("ts", System.currentTimeMillis());
        } catch (Throwable ignored) {
            /* never happens */
        }
        writeState(o);
    }

    private static void writeDenied() {
        JSONObject o = new JSONObject();
        try {
            o.put("state", "denied");
            o.put("count", 0);
            o.put("message", "media permission denied");
        } catch (Throwable ignored) {
            /* never happens */
        }
        writeState(o);
    }

    private static void fail(String where, Throwable t) {
        JSONObject o = new JSONObject();
        try {
            o.put("state", "error");
            o.put("count", 0);
            o.put("where", where);
            o.put("message", t == null ? "unknown" : String.valueOf(t.getMessage()));
        } catch (Throwable ignored) {
            /* never happens */
        }
        writeState(o);
    }

    private static synchronized void writeState(JSONObject o) {
        if (workDir == null) return;
        try {
            if (serverPort > 0) o.put("serverPort", serverPort);
            File tmp = new File(workDir, "state.tmp");
            File target = new File(workDir, "state.json");
            writeFile(tmp, o.toString());
            if (!tmp.renameTo(target)) {
                writeFile(target, o.toString());
                tmp.delete();
            }
        } catch (Throwable ignored) {
            /* a failed write leaves the previous state in place */
        }
    }

    private static void writeFile(File f, String text) throws Exception {
        OutputStream os = null;
        try {
            os = new FileOutputStream(f);
            os.write(text.getBytes(Charset.forName("UTF-8")));
            os.flush();
        } finally {
            if (os != null) os.close();
        }
    }

    private static String readFile(File f) {
        InputStream is = null;
        try {
            is = new java.io.FileInputStream(f);
            byte[] buf = new byte[(int) Math.min(f.length() + 16, 8 * 1024 * 1024)];
            int read = is.read(buf);
            if (read <= 0) return "";
            return new String(buf, 0, read, Charset.forName("UTF-8"));
        } catch (Throwable t) {
            return null;
        } finally {
            if (is != null) {
                try {
                    is.close();
                } catch (Throwable ignored) {
                    /* ignore */
                }
            }
        }
    }
}
