package com.xiaomu.community;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

public class AdminAdapter extends RecyclerView.Adapter<RecyclerView.ViewHolder> {

    public static final int MODE_STAT = 0, MODE_USER = 1, MODE_BOARD = 2, MODE_POST = 3, MODE_REPORT = 4;

    public interface Listener {
        void onUser(JSONObject user);
        void onBoardEdit(JSONObject board);
        void onBoardDelete(JSONObject board);
        void onPostPin(JSONObject post, int pos);
        void onPostHide(JSONObject post, int pos);
        void onPostDelete(JSONObject post, int pos);
        void onReportDelete(JSONObject report, int pos);
        void onReportDismiss(JSONObject report, int pos);
    }

    private final List<JSONObject> data = new ArrayList<>();
    private final Listener listener;
    private int mode = MODE_STAT;

    public AdminAdapter(Listener listener) { this.listener = listener; }

    public void setMode(int mode) {
        this.mode = mode;
        data.clear();
        notifyDataSetChanged();
    }

    public void setData(List<JSONObject> list) {
        data.clear();
        if (list != null) data.addAll(list);
        notifyDataSetChanged();
    }

    public int getMode() { return mode; }

    @Override public int getItemCount() { return data.size(); }

    @Override public int getItemViewType(int position) { return mode; }

    @NonNull
    @Override
    public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        LayoutInflater inf = LayoutInflater.from(parent.getContext());
        switch (viewType) {
            case MODE_USER: return new UserVH(inf.inflate(R.layout.item_admin_user, parent, false));
            case MODE_BOARD: return new BoardVH(inf.inflate(R.layout.item_admin_board, parent, false));
            case MODE_POST: return new PostVH(inf.inflate(R.layout.item_admin_post, parent, false));
            case MODE_REPORT: return new ReportVH(inf.inflate(R.layout.item_admin_report, parent, false));
            default: return new StatVH(inf.inflate(R.layout.item_stat, parent, false));
        }
    }

    @Override
    public void onBindViewHolder(@NonNull RecyclerView.ViewHolder holder, int position) {
        JSONObject o = data.get(position);
        if (holder instanceof StatVH) {
            StatVH h = (StatVH) holder;
            h.value.setText(o.optString("value", "0"));
            h.label.setText(o.optString("label"));
        } else if (holder instanceof UserVH) {
            bindUser((UserVH) holder, o);
        } else if (holder instanceof BoardVH) {
            bindBoard((BoardVH) holder, o);
        } else if (holder instanceof PostVH) {
            bindPost((PostVH) holder, o, position);
        } else if (holder instanceof ReportVH) {
            bindReport((ReportVH) holder, o, position);
        }
    }

    private void bindUser(UserVH h, JSONObject u) {
        Context ctx = h.itemView.getContext();
        h.username.setText(u.optString("username"));
        Glide.with(ctx).load(Api.mediaUrl(u.optString("avatar"))).circleCrop().into(h.avatar);
        h.badgeRole.setVisibility("admin".equals(u.optString("role")) ? View.VISIBLE : View.GONE);

        boolean banned = "banned".equals(u.optString("status"));
        String mutedUntil = u.optString("muted_until", "");
        boolean muted = !mutedUntil.isEmpty() && isFuture(mutedUntil);
        h.badgeStatus.setVisibility(banned || muted ? View.VISIBLE : View.GONE);
        h.badgeStatus.setText(banned ? "已封禁" : "禁言中");
        h.badgeStatus.setTextColor(ctx.getColor(banned ? R.color.red : R.color.orange));

        StringBuilder sb = new StringBuilder("ID " + u.optInt("id"));
        if (muted) {
            sb.append(" · 禁言至 ").append(mutedUntil);
            String reason = u.optString("mute_reason", "");
            if (!reason.isEmpty()) sb.append("（").append(reason).append("）");
        }
        sb.append(" · ").append(u.optInt("can_post", 1) == 1 ? "可发帖" : "禁止发帖");
        h.meta.setText(sb.toString());
        h.btnManage.setOnClickListener(v -> listener.onUser(u));
    }

    private void bindBoard(BoardVH h, JSONObject b) {
        h.icon.setText(b.optString("icon", "社"));
        try {
            h.icon.setBackgroundTintList(ColorStateList.valueOf(Color.parseColor(b.optString("color", "#00B34F"))));
        } catch (Exception ignored) {
            h.icon.setBackgroundTintList(ColorStateList.valueOf(Color.parseColor("#00B34F")));
        }
        h.name.setText(b.optString("name"));
        String desc = b.optString("description", "");
        h.meta.setText("key: " + b.optString("key") + " · " + b.optInt("count") + " 帖"
                + (desc.isEmpty() ? "" : " · " + desc));
        h.btnEdit.setOnClickListener(v -> listener.onBoardEdit(b));
        h.btnDelete.setOnClickListener(v -> listener.onBoardDelete(b));
    }

    private void bindPost(PostVH h, JSONObject p, int pos) {
        h.username.setText(p.optString("username", "匿名用户"));
        String status = p.optString("status", "published");
        boolean hidden = "hidden".equals(status);
        boolean pinned = p.optInt("pinned", 0) == 1;
        String badge;
        int color;
        if (hidden) { badge = "已隐藏"; color = R.color.orange; }
        else if (pinned) { badge = "已置顶"; color = R.color.green; }
        else { badge = "已发布"; color = R.color.green; }
        h.badgeStatus.setText(badge);
        h.badgeStatus.setTextColor(h.itemView.getContext().getColor(color));

        String title = p.optString("title", "");
        String content = p.optString("content", "");
        h.content.setText(title.isEmpty() ? content : title + " · " + content);
        h.meta.setText("#" + p.optInt("id") + " · 赞 " + p.optInt("likes_count")
                + " · 评 " + p.optInt("comments_count") + " · " + TimeUtil.ago(p.optString("created_at")));
        h.btnPin.setText(pinned ? "取消置顶" : "置顶");
        h.btnHide.setText(hidden ? "恢复显示" : "隐藏");
        h.btnPin.setOnClickListener(v -> listener.onPostPin(p, pos));
        h.btnHide.setOnClickListener(v -> listener.onPostHide(p, pos));
        h.btnDelete.setOnClickListener(v -> listener.onPostDelete(p, pos));
    }

    private void bindReport(ReportVH h, JSONObject r, int pos) {
        Context ctx = h.itemView.getContext();
        String tt = r.optString("target_type");
        h.type.setText("post".equals(tt) ? "帖子举报" : "comment".equals(tt) ? "评论举报" : "用户举报");
        String status = r.optString("status", "pending");
        if ("pending".equals(status)) {
            h.badgeStatus.setText("待处理");
            h.badgeStatus.setTextColor(ctx.getColor(R.color.red));
        } else if ("done".equals(status)) {
            h.badgeStatus.setText("已处理");
            h.badgeStatus.setTextColor(ctx.getColor(R.color.green));
        } else {
            h.badgeStatus.setText("已忽略");
            h.badgeStatus.setTextColor(ctx.getColor(R.color.muted));
        }
        h.target.setText(r.optString("target_text"));
        String reason = r.optString("reason", "");
        h.reason.setText(reason.isEmpty() ? "未填写原因" : "原因：" + reason);
        h.meta.setText("举报人 " + r.optString("reporter_name", "匿名") + " · " + TimeUtil.ago(r.optString("created_at")));

        boolean pending = "pending".equals(status);
        h.btnDelete.setVisibility(pending ? View.VISIBLE : View.GONE);
        h.btnDismiss.setVisibility(pending ? View.VISIBLE : View.GONE);
        h.btnDelete.setOnClickListener(v -> listener.onReportDelete(r, pos));
        h.btnDismiss.setOnClickListener(v -> listener.onReportDismiss(r, pos));
    }

    private static boolean isFuture(String time) {
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.CHINA);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = f.parse(time.replace("T", " "));
            return d != null && d.getTime() > System.currentTimeMillis();
        } catch (Exception e) {
            return false;
        }
    }

    static class StatVH extends RecyclerView.ViewHolder {
        TextView value, label;
        StatVH(@NonNull View v) {
            super(v);
            value = v.findViewById(R.id.value);
            label = v.findViewById(R.id.label);
        }
    }

    static class UserVH extends RecyclerView.ViewHolder {
        ImageView avatar;
        TextView username, badgeRole, badgeStatus, meta, btnManage;
        UserVH(@NonNull View v) {
            super(v);
            avatar = v.findViewById(R.id.avatar);
            username = v.findViewById(R.id.username);
            badgeRole = v.findViewById(R.id.badge_role);
            badgeStatus = v.findViewById(R.id.badge_status);
            meta = v.findViewById(R.id.meta);
            btnManage = v.findViewById(R.id.btn_manage);
        }
    }

    static class BoardVH extends RecyclerView.ViewHolder {
        TextView icon, name, meta, btnEdit, btnDelete;
        BoardVH(@NonNull View v) {
            super(v);
            icon = v.findViewById(R.id.icon);
            name = v.findViewById(R.id.name);
            meta = v.findViewById(R.id.meta);
            btnEdit = v.findViewById(R.id.btn_edit);
            btnDelete = v.findViewById(R.id.btn_delete);
        }
    }

    static class PostVH extends RecyclerView.ViewHolder {
        TextView username, badgeStatus, content, meta, btnPin, btnHide, btnDelete;
        PostVH(@NonNull View v) {
            super(v);
            username = v.findViewById(R.id.username);
            badgeStatus = v.findViewById(R.id.badge_status);
            content = v.findViewById(R.id.content);
            meta = v.findViewById(R.id.meta);
            btnPin = v.findViewById(R.id.btn_pin);
            btnHide = v.findViewById(R.id.btn_hide);
            btnDelete = v.findViewById(R.id.btn_delete);
        }
    }

    static class ReportVH extends RecyclerView.ViewHolder {
        TextView type, badgeStatus, target, reason, meta, btnDelete, btnDismiss;
        ReportVH(@NonNull View v) {
            super(v);
            type = v.findViewById(R.id.type);
            badgeStatus = v.findViewById(R.id.badge_status);
            target = v.findViewById(R.id.target);
            reason = v.findViewById(R.id.reason);
            meta = v.findViewById(R.id.meta);
            btnDelete = v.findViewById(R.id.btn_delete);
            btnDismiss = v.findViewById(R.id.btn_dismiss);
        }
    }
}
