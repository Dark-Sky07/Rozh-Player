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
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Size;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
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
