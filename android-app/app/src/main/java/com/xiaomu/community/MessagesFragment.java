package com.xiaomu.community;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class MessagesFragment extends Fragment {
    private NotificationAdapter adapter;
    private SwipeRefreshLayout swipe;
    private View empty;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup c, @Nullable Bundle s) {
        return inflater.inflate(R.layout.fragment_messages, c, false);
    }

    @Override
    public void onViewCreated(@NonNull View v, @Nullable Bundle s) {
        swipe = v.findViewById(R.id.swipe);
        empty = v.findViewById(R.id.empty);
        adapter = new NotificationAdapter(n -> {
            if ("notice".equals(n.optString("type"))) {
                showNotice(n);
                return;
            }
            Intent i = new Intent(getActivity(), PostDetailActivity.class);
            i.putExtra("id", n.optInt("post_id"));
            startActivity(i);
        });
        RecyclerView rv = v.findViewById(R.id.rv);
        rv.setLayoutManager(new LinearLayoutManager(getActivity()));
        rv.setAdapter(adapter);
        swipe.setColorSchemeColors(getResources().getColor(R.color.green));
        swipe.setOnRefreshListener(this::load);
        v.findViewById(R.id.chat_entry).setOnClickListener(x ->
                startActivity(new Intent(getActivity(), ChatActivity.class)));
        v.findViewById(R.id.friends_entry).setOnClickListener(x ->
                startActivity(new Intent(getActivity(), FriendsActivity.class)));
        load();
    }

    private void showNotice(JSONObject n) {
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(getActivity())
                .setTitle(n.optString("title", "官方通知"))
                .setMessage(n.optString("content"))
                .setPositiveButton("知道了", null)
                .show();
        if (n.optInt("read", 0) == 1) return;
        Api.post("/api/notices/" + n.optInt("notice_id") + "/read", new JSONObject(), new Api.Cb() {
            @Override public void ok(JSONObject o) { load(); }
            @Override public void fail(String msg) {}
        });
    }

    private void load() {
        Api.get("/api/notifications", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                swipe.setRefreshing(false);
                List<JSONObject> list = new ArrayList<>();
                JSONArray arr = o.optJSONArray("notifications");
                if (arr != null) for (int i = 0; i < arr.length(); i++) {
                    JSONObject n = arr.optJSONObject(i);
                    if (n != null) list.add(n);
                }
                adapter.setData(list);
                empty.setVisibility(list.isEmpty() ? View.VISIBLE : View.GONE);
            }
            @Override public void fail(String msg) {
                swipe.setRefreshing(false);
                Toast.makeText(getActivity(), msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        load();
    }
}
