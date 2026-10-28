package com.xiaomu.community;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class Api {
    public static final String BASE = "https://votehub-1644.onrender.com";
    private static final MediaType JSON_TYPE = MediaType.parse("application/json; charset=utf-8");
    private static final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
            .writeTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
            .build();
    private static final ExecutorService exec = Executors.newFixedThreadPool(4);
    private static final Handler main = new Handler(Looper.getMainLooper());

    public interface Cb {
        void ok(JSONObject o);
        void fail(String msg);
    }

    public static String mediaUrl(String path) {
        if (path == null || path.isEmpty()) return BASE + "/img/default-duck.png";
        if (path.startsWith("http")) return path;
        return BASE + path;
    }

    private static Request.Builder req(String path) {
        Request.Builder b = new Request.Builder().url(BASE + path);
        String token = Session.token();
        if (token != null && !token.isEmpty()) b.header("Authorization", "Bearer " + token);
        return b;
    }

    public static void get(String path, Cb cb) {
        enqueue(req(path).get().build(), cb);
    }

    public static void post(String path, JSONObject body, Cb cb) {
        RequestBody rb = RequestBody.create(body == null ? "{}" : body.toString(), JSON_TYPE);
        enqueue(req(path).post(rb).build(), cb);
    }

    public static void put(String path, JSONObject body, Cb cb) {
        RequestBody rb = RequestBody.create(body == null ? "{}" : body.toString(), JSON_TYPE);
        enqueue(req(path).put(rb).build(), cb);
    }

    public static void delete(String path, Cb cb) {
        enqueue(req(path).delete().build(), cb);
    }

    public static void upload(String path, Map<String, String> fields, List<File> images, String fileField, Cb cb) {
        MultipartBody.Builder b = new MultipartBody.Builder().setType(MultipartBody.FORM);
        if (fields != null) for (Map.Entry<String, String> e : fields.entrySet()) b.addFormDataPart(e.getKey(), e.getValue());
        if (images != null) for (File f : images) {
            b.addFormDataPart(fileField, f.getName(), RequestBody.create(f, MediaType.parse("image/*")));
        }
        enqueue(req(path).post(b.build()).build(), cb);
    }

    private static void enqueue(Request request, Cb cb) {
        exec.execute(() -> {
            try (Response res = client.newCall(request).execute()) {
                String body = res.body() != null ? res.body().string() : "{}";
                JSONObject json = parse(body);
                if (!res.isSuccessful()) {
                    String msg = json.optString("error", "请求失败(" + res.code() + ")");
                    main.post(() -> cb.fail(msg));
                    return;
                }
                main.post(() -> cb.ok(json));
            } catch (IOException e) {
                main.post(() -> cb.fail("网络连接失败，请检查网络"));
            } catch (Exception e) {
                main.post(() -> cb.fail("数据解析失败"));
            }
        });
    }

    /** 数组响应会被包装为 {"data": [...]}，用 arr() 取出 */
    private static JSONObject parse(String body) {
        String t = body == null ? "" : body.trim();
        if (t.isEmpty()) return new JSONObject();
        if (t.startsWith("[")) {
            JSONObject w = new JSONObject();
            try { w.put("data", new JSONArray(t)); } catch (Exception ignored) {}
            return w;
        }
        try { return new JSONObject(t); } catch (Exception e) { return new JSONObject(); }
    }

    public static JSONArray arr(JSONObject o) {
        JSONArray a = o == null ? null : o.optJSONArray("data");
        return a == null ? new JSONArray() : a;
    }
}
