package com.xiaomu.community;

import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class BoardAdapter extends RecyclerView.Adapter<BoardAdapter.VH> {
    private final List<JSONObject> data = new ArrayList<>();
    private final OnClick onClick;

    public interface OnClick { void click(JSONObject board); }

    public BoardAdapter(OnClick c) { this.onClick = c; }

    public void setData(List<JSONObject> list) {
        data.clear();
        data.addAll(list);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new VH(LayoutInflater.from(parent.getContext()).inflate(R.layout.item_board, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int position) {
        JSONObject b = data.get(position);
        h.name.setText(b.optString("name"));
        h.icon.setText(b.optString("icon", "社"));
        h.desc.setText(b.optString("description"));
        h.count.setText(b.optInt("count", 0) + " 篇帖子");

        try {
            GradientDrawable g = new GradientDrawable();
            g.setShape(GradientDrawable.OVAL);
            g.setColor(Color.parseColor(b.optString("color", "#00B34F")));
            h.icon.setBackground(g);
        } catch (Exception ignored) {}

        h.itemView.setOnClickListener(v -> onClick.click(b));
    }

    @Override
    public int getItemCount() { return data.size(); }

    static class VH extends RecyclerView.ViewHolder {
        TextView icon, name, desc, count;

        VH(@NonNull View v) {
            super(v);
            icon = v.findViewById(R.id.icon);
            name = v.findViewById(R.id.name);
            desc = v.findViewById(R.id.desc);
            count = v.findViewById(R.id.count);
        }
    }
}
