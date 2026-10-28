package com.xiaomu.community;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.util.TypedValue;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.resource.bitmap.RoundedCorners;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class PostAdapter extends RecyclerView.Adapter<PostAdapter.VH> {
    public interface Listener {
        void onOpen(JSONObject post);
        void onLike(JSONObject post, int position);
        void onShare(JSONObject post);
        void onUser(JSONObject post);
        void onVote(JSONObject post, int optionId);
    }

    private final List<JSONObject> data = new ArrayList<>();
    private final Map<String, String> boards = new HashMap<>();
    private final Listener listener;

    public PostAdapter(Listener listener) { this.listener = listener; }

    public void setBoards(Map<String, String> map) {
        boards.clear();
        boards.putAll(map);
        notifyDataSetChanged();
    }

    public void setData(List<JSONObject> list) {
        data.clear();
        data.addAll(list);
        notifyDataSetChanged();
    }

    public void append(List<JSONObject> list) {
        int start = data.size();
        data.addAll(list);
        notifyItemRangeInserted(start, list.size());
    }

    public List<JSONObject> getData() { return data; }

    public void updateLike(int pos, boolean liked, int count) {
        if (pos < 0 || pos >= data.size()) return;
        JSONObject p = data.get(pos);
        try { p.put("liked", liked); p.put("likes_count", count); } catch (Exception ignored) {}
        notifyItemChanged(pos);
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_post, parent, false);
        return new VH(v);
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int position) {
        JSONObject p = data.get(position);
        Context ctx = h.itemView.getContext();

        h.username.setText(p.optString("username", "匿名用户") + " · Lv." + Math.max(1, p.optInt("user_level", 1)));
        h.time.setText(TimeUtil.ago(p.optString("created_at")));
        h.badgeAdmin.setVisibility("admin".equals(p.optString("user_role")) ? View.VISIBLE : View.GONE);
        h.badgePin.setVisibility(p.optInt("pinned", 0) == 1 ? View.VISIBLE : View.GONE);
        Glide.with(ctx).load(Api.mediaUrl(p.optString("avatar"))).circleCrop().into(h.avatar);
        h.avatar.setOnClickListener(v -> listener.onUser(p));
        h.username.setOnClickListener(v -> listener.onUser(p));

        String boardKey = p.optString("topic");
        h.board.setText(boards.containsKey(boardKey) ? boards.get(boardKey) : "社区");

        String title = p.optString("title");
        if (title.isEmpty()) {
            h.title.setVisibility(View.GONE);
        } else {
            h.title.setVisibility(View.VISIBLE);
            h.title.setText(title);
        }
        h.content.setText(p.optString("content"));

        bindImages(h.images, p.optJSONArray("images"), ctx);
        bindPoll(h.pollBox, p.optJSONObject("poll"), p, listener, ctx);

        String video = p.optString("video", "");
        h.videoBox.setVisibility(video.isEmpty() ? View.GONE : View.VISIBLE);
        h.videoBox.setOnClickListener(v -> {
            try {
                Intent it = new Intent(Intent.ACTION_VIEW);
                it.setDataAndType(Uri.parse(Api.mediaUrl(video)), "video/*");
                it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                ctx.startActivity(it);
            } catch (Exception ignored) {}
        });

        h.countComment.setText(String.valueOf(p.optInt("comments_count", 0)));
        h.countLike.setText(String.valueOf(p.optInt("likes_count", 0)));
        boolean liked = p.optBoolean("liked", false);
        h.icLike.setImageResource(liked ? R.drawable.ic_heart_fill : R.drawable.ic_heart);
        h.icLike.setColorFilter(liked ? Color.TRANSPARENT : ctx.getColor(R.color.muted));

        h.actLike.setOnClickListener(v -> listener.onLike(p, h.getAdapterPosition()));
        h.itemView.setOnClickListener(v -> listener.onOpen(p));
        h.actComment.setOnClickListener(v -> listener.onOpen(p));
        h.actShare.setOnClickListener(v -> listener.onShare(p));
    }

    static void bindPoll(LinearLayout box, JSONObject poll, JSONObject post, Listener listener, Context ctx) {
        box.removeAllViews();
        if (poll == null) {
            box.setVisibility(View.GONE);
            return;
        }
        box.setVisibility(View.VISIBLE);
        JSONArray opts = poll.optJSONArray("options");
        if (opts == null || opts.length() == 0) {
            box.setVisibility(View.GONE);
            return;
        }
        int total = poll.optInt("total_votes", 0);
        int mine = poll.optInt("my_option", 0);
        for (int i = 0; i < opts.length(); i++) {
            JSONObject o = opts.optJSONObject(i);
            if (o == null) continue;
            int id = o.optInt("id");
            int votes = o.optInt("votes", 0);
            int pct = total > 0 ? Math.round(votes * 100f / total) : 0;
            TextView tv = new TextView(ctx);
            tv.setText(o.optString("text") + "    " + votes + " 票 · " + pct + "%" + (mine == id ? " · 已投" : ""));
            tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            tv.setTextColor(ctx.getColor(mine == id ? R.color.green : R.color.text));
            tv.setBackgroundResource(mine == id ? R.drawable.bg_chip_sel : R.drawable.bg_search);
            int padH = dp(ctx, 12), padV = dp(ctx, 9);
            tv.setPadding(padH, padV, padH, padV);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            if (i > 0) lp.topMargin = dp(ctx, 6);
            tv.setLayoutParams(lp);
            if (mine == 0) tv.setOnClickListener(v -> listener.onVote(post, id));
            box.addView(tv);
        }
    }

    static void bindImages(LinearLayout box, JSONArray arr, Context ctx) {
        box.removeAllViews();
        if (arr == null || arr.length() == 0) {
            box.setVisibility(View.GONE);
            return;
        }
        box.setVisibility(View.VISIBLE);
        int gap = dp(ctx, 4);
        int width = ctx.getResources().getDisplayMetrics().widthPixels - dp(ctx, 28);
        int count = Math.min(arr.length(), 9);

        if (count == 1) {
            ImageView iv = new ImageView(ctx);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(ctx, 200));
            iv.setLayoutParams(lp);
            Glide.with(ctx).load(Api.mediaUrl(arr.optString(0)))
                    .transform(new RoundedCorners(dp(ctx, 10))).into(iv);
            box.addView(iv);
            return;
        }

        int cell = (width - gap * 2) / 3;
        int rowCount = (count + 2) / 3;
        for (int r = 0; r < rowCount; r++) {
            LinearLayout row = new LinearLayout(ctx);
            row.setOrientation(LinearLayout.HORIZONTAL);
            LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            if (r > 0) rowLp.topMargin = gap;
            row.setLayoutParams(rowLp);
            for (int c = 0; c < 3; c++) {
                int idx = r * 3 + c;
                if (idx >= count) break;
                ImageView iv = new ImageView(ctx);
                iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(cell, cell);
                if (c > 0) lp.leftMargin = gap;
                iv.setLayoutParams(lp);
                Glide.with(ctx).load(Api.mediaUrl(arr.optString(idx)))
                        .transform(new RoundedCorners(dp(ctx, 8))).into(iv);
                row.addView(iv);
            }
            box.addView(row);
        }
    }

    static int dp(Context c, int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics());
    }

    @Override
    public int getItemCount() { return data.size(); }

    static class VH extends RecyclerView.ViewHolder {
        ImageView avatar, icLike;
        TextView username, time, board, title, content, countLike, countComment, badgeAdmin, badgePin;
        LinearLayout images, actLike, actComment, actShare, videoBox, pollBox;

        VH(@NonNull View v) {
            super(v);
            avatar = v.findViewById(R.id.avatar);
            icLike = v.findViewById(R.id.ic_like);
            username = v.findViewById(R.id.username);
            time = v.findViewById(R.id.time);
            board = v.findViewById(R.id.board);
            title = v.findViewById(R.id.title);
            content = v.findViewById(R.id.content);
            countLike = v.findViewById(R.id.count_like);
            countComment = v.findViewById(R.id.count_comment);
            badgeAdmin = v.findViewById(R.id.badge_admin);
            badgePin = v.findViewById(R.id.badge_pin);
            images = v.findViewById(R.id.images);
            videoBox = v.findViewById(R.id.video_box);
            pollBox = v.findViewById(R.id.poll_box);
            actLike = v.findViewById(R.id.act_like);
            actComment = v.findViewById(R.id.act_comment);
            actShare = v.findViewById(R.id.act_share);
        }
    }
}
