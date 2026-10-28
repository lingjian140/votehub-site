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

public class RewardAdapter extends RecyclerView.Adapter<RewardAdapter.VH> {
    public interface Listener { void onRedeem(JSONObject reward); }

    private final List<JSONObject> data = new ArrayList<>();
    private final Listener listener;

    public RewardAdapter(Listener l) { this.listener = l; }

    public void setData(List<JSONObject> list) {
        data.clear();
        data.addAll(list);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new VH(LayoutInflater.from(parent.getContext()).inflate(R.layout.item_reward, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int pos) {
        JSONObject r = data.get(pos);
        String icon = r.optString("icon", "礼");
        h.icon.setText(icon.isEmpty() ? "礼" : icon);
        h.title.setText(r.optString("title"));
        h.desc.setText(r.optString("description"));
        int stock = r.optInt("stock", -1);
        h.cost.setText(r.optInt("cost") + " 积分" + (stock >= 0 ? " · 剩 " + stock : ""));
        h.btn.setEnabled(stock != 0);
        h.btn.setText(stock == 0 ? "已兑完" : "兑换");
        h.btn.setOnClickListener(v -> listener.onRedeem(r));
    }

    @Override
    public int getItemCount() { return data.size(); }

    static class VH extends RecyclerView.ViewHolder {
        TextView icon, title, desc, cost, btn;

        VH(@NonNull View v) {
            super(v);
            icon = v.findViewById(R.id.icon);
            title = v.findViewById(R.id.title);
            desc = v.findViewById(R.id.desc);
            cost = v.findViewById(R.id.cost);
            btn = v.findViewById(R.id.btn_redeem);
        }
    }
}
