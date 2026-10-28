package com.xiaomu.community;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

public class Session {
    private static SharedPreferences sp;

    public static void init(Context c) {
        sp = c.getSharedPreferences("xiaomu", Context.MODE_PRIVATE);
    }

    public static String token() { return sp.getString("token", ""); }

    public static void save(String token, JSONObject user) {
        sp.edit().putString("token", token).putString("user", user == null ? "{}" : user.toString()).apply();
    }

    public static void updateUser(JSONObject user) {
        if (user != null) sp.edit().putString("user", user.toString()).apply();
    }

    public static JSONObject user() {
        try { return new JSONObject(sp.getString("user", "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    public static int userId() { return user().optInt("id", 0); }
    public static String username() { return user().optString("username", ""); }
    public static String avatar() { return user().optString("avatar", "/img/default-duck.png"); }
    public static String role() { return user().optString("role", "user"); }
    public static boolean isAdmin() { return "admin".equals(role()); }
    public static boolean logged() { return !token().isEmpty(); }

    public static void clear() {
        sp.edit().remove("token").remove("user").apply();
    }
}
