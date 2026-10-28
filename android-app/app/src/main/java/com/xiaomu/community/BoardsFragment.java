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
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class BoardsFragment extends Fragment {
    private BoardAdapter adapter;
    private SwipeRefreshLayout swipe;
    private View search;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup c, @Nullable Bundle s) {
        return inflater.inflate(R.layout.fragment_boards, c, false);
    }

    @Override
    public void onViewCreated(@NonNull View v, @Nullable Bundle s) {
        swipe = v.findViewById(R.id.swipe);
        search = v.findViewById(R.id.boards_search);
        adapter = new BoardAdapter(b -> {
            Intent i = new Intent(getActivity(), PostListActivity.class);
            i.putExtra("topic", b.optString("key"));
            i.putExtra("title", b.optString("name"));
            startActivity(i);
        });
        RecyclerView rv = v.findViewById(R.id.rv);
        rv.setLayoutManager(new GridLayoutManager(getActivity(), 2));
        rv.setAdapter(adapter);
        swipe.setColorSchemeColors(getResources().getColor(R.color.green));
        swipe.setOnRefreshListener(this::load);
        search.setOnClickListener(x -> Toast.makeText(getActivity(), "在首页顶部搜索全部内容", Toast.LENGTH_SHORT).show());
        load();
    }

    private void load() {
        Api.get("/api/boards", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                swipe.setRefreshing(false);
                List<JSONObject> list = new ArrayList<>();
                try {
                    JSONArray arr = Api.arr(o);
                    for (int i = 0; i < arr.length(); i++) list.add(arr.getJSONObject(i));
                } catch (Exception ignored) {}
                adapter.setData(list);
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
