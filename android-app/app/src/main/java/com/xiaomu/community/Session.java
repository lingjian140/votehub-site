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
    public static String avatar() { return user().optString("avatar", "/img/default-leaf.png"); }
    public static String role() { return user().optString("role", "user"); }
    public static boolean isAdmin() { return "admin".equals(role()); }
    public static boolean isDeveloper() { return user().optInt("is_developer", 0) == 1; }
    public static int points() { return user().optInt("points", 0); }
    public static int level() { return Math.max(1, user().optInt("level", 1)); }
    public static boolean logged() { return !token().isEmpty(); }

    public static void updatePoints(int points, int level) {
        JSONObject u = user();
        try { u.put("points", points); u.put("level", level); } catch (Exception ignored) {}
        updateUser(u);
    }

    public static boolean ageConfirmed() { return sp.getBoolean("age_confirmed", false); }
    public static void setAgeConfirmed() { sp.edit().putBoolean("age_confirmed", true).apply(); }
    public static boolean boardUnlocked(String key) {
        return sp.getString("unlocked_boards", "").contains("|" + key + "|");
    }
    public static void unlockBoard(String key) {
        String cur = sp.getString("unlocked_boards", "|");
        if (!cur.contains("|" + key + "|")) sp.edit().putString("unlocked_boards", cur + key + "|").apply();
    }

    public static void clear() {
        sp.edit().remove("token").remove("user").apply();
    }
}
