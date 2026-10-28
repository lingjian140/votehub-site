package com.xiaomu.community;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class DevRewardAdapter extends RecyclerView.Adapter<DevRewardAdapter.VH> {
    public interface Listener {
        void onEdit(JSONObject reward);
        void onDelete(JSONObject reward);
    }

    private final List<JSONObject> data = new ArrayList<>();
    private final Listener listener;

    public DevRewardAdapter(Listener l) { this.listener = l; }

    public void setData(List<JSONObject> list) {
        data.clear();
        data.addAll(list);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new VH(LayoutInflater.from(parent.getContext()).inflate(R.layout.item_dev_reward, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int pos) {
        JSONObject r = data.get(pos);
        String icon = r.optString("icon", "礼");
        h.icon.setText(icon.isEmpty() ? "礼" : icon);
        h.title.setText(r.optString("title"));
        int stock = r.optInt("stock", -1);
        h.sub.setText(r.optInt("cost") + " 积分 · " + (stock < 0 ? "不限库存" : "库存 " + stock)
                + (r.optInt("enabled", 1) == 1 ? "" : " · 已下架"));
        h.edit.setOnClickListener(v -> listener.onEdit(r));
        h.del.setOnClickListener(v -> listener.onDelete(r));
    }

    @Override
    public int getItemCount() { return data.size(); }

    static class VH extends RecyclerView.ViewHolder {
        TextView icon, title, sub, edit, del;

        VH(@NonNull View v) {
            super(v);
            icon = v.findViewById(R.id.icon);
            title = v.findViewById(R.id.title);
            sub = v.findViewById(R.id.sub);
            edit = v.findViewById(R.id.btn_edit);
            del = v.findViewById(R.id.btn_del);
        }
    }
}
