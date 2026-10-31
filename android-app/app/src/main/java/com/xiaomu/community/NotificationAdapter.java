package com.xiaomu.community;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class NotificationAdapter extends RecyclerView.Adapter<NotificationAdapter.VH> {
    private final List<JSONObject> data = new ArrayList<>();
    private final OnClick click;

    public interface OnClick { void click(JSONObject n); }

    public NotificationAdapter(OnClick c) { this.click = c; }

    public void setData(List<JSONObject> list) {
        data.clear();
        data.addAll(list);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new VH(LayoutInflater.from(parent.getContext()).inflate(R.layout.item_notification, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int position) {
        JSONObject n = data.get(position);
        String type = n.optString("type");
        if ("notice".equals(type)) {
            h.text.setText("📢 官方通知：" + n.optString("title") + "\n" + n.optString("content"));
            Glide.with(h.itemView.getContext()).load(Api.mediaUrl("/img/default-leaf.png"))
                    .circleCrop().into(h.avatar);
        } else {
            String name = n.optString("username", "有人");
            String text = "comment".equals(type)
                    ? name + " 评论了你的帖子：" + n.optString("content")
                    : name + " 赞了你的帖子";
            h.text.setText(text);
            Glide.with(h.itemView.getContext()).load(Api.mediaUrl(n.optString("avatar")))
                    .circleCrop().into(h.avatar);
        }
        h.time.setText(TimeUtil.ago(n.optString("created_at")));
        h.itemView.setOnClickListener(v -> click.click(n));
    }

    @Override
    public int getItemCount() { return data.size(); }

    static class VH extends RecyclerView.ViewHolder {
        ImageView avatar;
        TextView text, time;

        VH(@NonNull View v) {
            super(v);
            avatar = v.findViewById(R.id.avatar);
            text = v.findViewById(R.id.text);
            time = v.findViewById(R.id.time);
        }
    }
}
