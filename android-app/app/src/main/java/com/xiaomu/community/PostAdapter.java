package com.xiaomu.community;

import android.content.Context;
import android.graphics.Color;
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

        h.username.setText(p.optString("username", "匿名用户"));
        h.time.setText(TimeUtil.ago(p.optString("created_at")));
        h.badgeAdmin.setVisibility("admin".equals(p.optString("user_role")) ? View.VISIBLE : View.GONE);
        h.badgePin.setVisibility(p.optInt("pinned", 0) == 1 ? View.VISIBLE : View.GONE);
        Glide.with(ctx).load(Api.mediaUrl(p.optString("avatar"))).circleCrop().into(h.avatar);

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
        LinearLayout images, actLike, actComment, actShare;

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
            actLike = v.findViewById(R.id.act_like);
            actComment = v.findViewById(R.id.act_comment);
            actShare = v.findViewById(R.id.act_share);
        }
    }
}
