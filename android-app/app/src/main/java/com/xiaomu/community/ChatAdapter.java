package com.xiaomu.community;

import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class ChatAdapter extends RecyclerView.Adapter<ChatAdapter.VH> {
    private final List<JSONObject> data = new ArrayList<>();
    private final int myId;

    public ChatAdapter(int myId) { this.myId = myId; }

    public void setData(List<JSONObject> list) {
        data.clear();
        data.addAll(list);
        notifyDataSetChanged();
    }

    public void add(JSONObject m) {
        data.add(m);
        notifyItemInserted(data.size() - 1);
    }

    public int lastId() {
        return data.isEmpty() ? 0 : data.get(data.size() - 1).optInt("id");
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new VH(LayoutInflater.from(parent.getContext()).inflate(R.layout.item_chat, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int position) {
        JSONObject m = data.get(position);
        boolean mine = m.optInt("user_id") == myId;

        h.root.setGravity(mine ? Gravity.END : Gravity.START);
        h.avatar.setVisibility(mine ? View.GONE : View.VISIBLE);
        h.name.setVisibility(mine ? View.GONE : View.VISIBLE);
        h.name.setText(m.optString("username"));
        h.bubble.setText(m.optString("content"));

        LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) h.bubbleBox.getLayoutParams();
        lp.leftMargin = mine ? 0 : PostAdapter.dp(h.itemView.getContext(), 8);
        h.bubbleBox.setLayoutParams(lp);

        if (mine) {
            h.bubble.setBackgroundResource(R.drawable.bg_bubble_mine);
            h.bubble.setTextColor(h.itemView.getContext().getColor(R.color.white));
        } else {
            h.bubble.setBackgroundResource(R.drawable.bg_bubble_other);
            h.bubble.setTextColor(h.itemView.getContext().getColor(R.color.text));
            Glide.with(h.itemView.getContext()).load(Api.mediaUrl(m.optString("avatar")))
                    .circleCrop().into(h.avatar);
        }
    }

    @Override
    public int getItemCount() { return data.size(); }

    static class VH extends RecyclerView.ViewHolder {
        LinearLayout root, bubbleBox;
        ImageView avatar;
        TextView name, bubble;

        VH(@NonNull View v) {
            super(v);
            root = v.findViewById(R.id.root);
            bubbleBox = v.findViewById(R.id.bubble_box);
            avatar = v.findViewById(R.id.avatar);
            name = v.findViewById(R.id.name);
            bubble = v.findViewById(R.id.bubble);
        }
    }
}
