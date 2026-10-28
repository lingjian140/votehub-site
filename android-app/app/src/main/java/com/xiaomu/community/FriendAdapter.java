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

public class FriendAdapter extends RecyclerView.Adapter<FriendAdapter.VH> {
    public interface Listener {
        void onOpen(JSONObject user);
        void onPrimary(JSONObject item);
        void onSecondary(JSONObject item);
    }

    private final List<JSONObject> data = new ArrayList<>();
    private final Listener listener;
    private boolean requestMode = false;

    public FriendAdapter(Listener l) { this.listener = l; }

    public void setRequestMode(boolean requestMode) {
        this.requestMode = requestMode;
        notifyDataSetChanged();
    }

    public void setData(List<JSONObject> list) {
        data.clear();
        data.addAll(list);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new VH(LayoutInflater.from(parent.getContext()).inflate(R.layout.item_friend, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int pos) {
        JSONObject u = data.get(pos);
        h.name.setText(u.optString("username") + " · Lv." + Math.max(1, u.optInt("level", 1)));
        h.sub.setText(requestMode ? "请求添加你为好友" : "点击可查看主页或私信");
        Glide.with(h.itemView.getContext()).load(Api.mediaUrl(u.optString("avatar")))
                .circleCrop().into(h.avatar);

        h.secondary.setVisibility(requestMode ? View.VISIBLE : View.GONE);
        h.primary.setText(requestMode ? "同意" : "私信");
        h.primary.setOnClickListener(v -> listener.onPrimary(u));
        h.secondary.setOnClickListener(v -> listener.onSecondary(u));
        h.itemView.setOnClickListener(v -> listener.onOpen(u));
    }

    @Override
    public int getItemCount() { return data.size(); }

    static class VH extends RecyclerView.ViewHolder {
        ImageView avatar;
        TextView name, sub, primary, secondary;

        VH(@NonNull View v) {
            super(v);
            avatar = v.findViewById(R.id.avatar);
            name = v.findViewById(R.id.name);
            sub = v.findViewById(R.id.sub);
            primary = v.findViewById(R.id.btn_primary);
            secondary = v.findViewById(R.id.btn_secondary);
        }
    }
}
