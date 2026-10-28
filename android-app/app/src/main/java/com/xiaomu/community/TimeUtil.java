package com.xiaomu.community;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class TimeUtil {
    public static String ago(String s) {
        if (s == null || s.trim().isEmpty()) return "";
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault());
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = f.parse(s.replace("T", " ").substring(0, Math.min(19, s.length())));
            long diff = (System.currentTimeMillis() - d.getTime()) / 1000;
            if (diff < 0) diff = 0;
            if (diff < 60) return "刚刚";
            if (diff < 3600) return (diff / 60) + " 分钟前";
            if (diff < 86400) return (diff / 3600) + " 小时前";
            if (diff < 86400 * 30) return (diff / 86400) + " 天前";
            SimpleDateFormat out = new SimpleDateFormat("MM-dd", Locale.getDefault());
            out.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
            return out.format(d);
        } catch (Exception e) {
            return s;
        }
    }
}
