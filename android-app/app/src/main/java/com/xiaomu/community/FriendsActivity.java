package com.xiaomu.community;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class FriendsActivity extends AppCompatActivity {
    private FriendAdapter friendAdapter, requestAdapter;
    private SwipeRefreshLayout swipe;
    private View emptyFriends, emptyRequests;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_friends);

        swipe = findViewById(R.id.swipe);
        emptyFriends = findViewById(R.id.empty_friends);
        emptyRequests = findViewById(R.id.empty_requests);
        findViewById(R.id.btn_back).setOnClickListener(v -> finish());

        friendAdapter = new FriendAdapter(new FriendAdapter.Listener() {
            @Override public void onOpen(JSONObject user) { openProfile(user.optInt("id")); }
            @Override public void onPrimary(JSONObject user) { openChat(user.optInt("id")); }
            @Override public void onSecondary(JSONObject user) {}
        });

        requestAdapter = new FriendAdapter(new FriendAdapter.Listener() {
            @Override public void onOpen(JSONObject user) { openProfile(user.optInt("requester_id")); }
            @Override public void onPrimary(JSONObject item) { handle(item, "accept"); }
            @Override public void onSecondary(JSONObject item) { handle(item, "decline"); }
        });
        requestAdapter.setRequestMode(true);

        RecyclerView rvFriends = findViewById(R.id.rv_friends);
        rvFriends.setLayoutManager(new LinearLayoutManager(this));
        rvFriends.setAdapter(friendAdapter);
        rvFriends.setNestedScrollingEnabled(false);

        RecyclerView rvRequests = findViewById(R.id.rv_requests);
        rvRequests.setLayoutManager(new LinearLayoutManager(this));
        rvRequests.setAdapter(requestAdapter);
        rvRequests.setNestedScrollingEnabled(false);

        swipe.setColorSchemeColors(getResources().getColor(R.color.green));
        swipe.setOnRefreshListener(this::load);
        load();
    }

    private void load() {
        Api.get("/api/friends", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                swipe.setRefreshing(false);
                JSONArray apps = o.optJSONArray("requests");
                List<JSONObject> reqs = new ArrayList<>();
                if (apps != null) for (int i = 0; i < apps.length(); i++) {
                    JSONObject x = apps.optJSONObject(i);
                    if (x != null) reqs.add(x);
                }
                JSONArray fs = o.optJSONArray("friends");
                List<JSONObject> friends = new ArrayList<>();
                if (fs != null) for (int i = 0; i < fs.length(); i++) {
                    JSONObject x = fs.optJSONObject(i);
                    if (x != null) friends.add(x);
                }
                requestAdapter.setData(reqs);
                friendAdapter.setData(friends);
                emptyRequests.setVisibility(reqs.isEmpty() ? View.VISIBLE : View.GONE);
                emptyFriends.setVisibility(friends.isEmpty() ? View.VISIBLE : View.GONE);
            }
            @Override public void fail(String msg) {
                swipe.setRefreshing(false);
                toast(msg);
            }
        });
    }

    private void handle(JSONObject item, String action) {
        if ("accept".equals(action)) {
            Api.post("/api/friends/requests/" + item.optInt("id") + "/accept", new JSONObject(), new Api.Cb() {
                @Override public void ok(JSONObject o) { toast("已添加为好友"); load(); }
                @Override public void fail(String msg) { toast(msg); }
            });
        } else {
            Api.post("/api/friends/requests/" + item.optInt("id") + "/decline", new JSONObject(), new Api.Cb() {
                @Override public void ok(JSONObject o) { load(); }
                @Override public void fail(String msg) { toast(msg); }
            });
        }
    }

    private void openProfile(int id) {
        Intent i = new Intent(this, UserProfileActivity.class);
        i.putExtra("id", id);
        startActivity(i);
    }

    private void openChat(int id) {
        if (id <= 0) return;
        Intent i = new Intent(this, PrivateChatActivity.class);
        i.putExtra("id", id);
        startActivity(i);
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }
}
