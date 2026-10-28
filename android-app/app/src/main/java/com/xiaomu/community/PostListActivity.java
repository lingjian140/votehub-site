package com.xiaomu.community;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class PostListActivity extends AppCompatActivity {

    private PostAdapter adapter;
    private SwipeRefreshLayout swipe;
    private String query = "";
    private int page = 1, pages = 1;
    private boolean loading = false;
    private final Map<String, String> boardNames = new HashMap<>();

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_post_list);

        TextView title = findViewById(R.id.title);
        title.setText(getIntent().getStringExtra("title") == null ? "帖子" : getIntent().getStringExtra("title"));
        findViewById(R.id.btn_back).setOnClickListener(v -> finish());

        int userId = getIntent().getIntExtra("user_id", 0);
        int likedBy = getIntent().getIntExtra("liked_by", 0);
        String topic = getIntent().getStringExtra("topic");
        if (userId > 0) query += "&user_id=" + userId;
        if (likedBy > 0) query += "&liked_by=" + likedBy;
        if (topic != null && !topic.isEmpty()) query += "&topic=" + topic;

        adapter = new PostAdapter(new PostAdapter.Listener() {
            @Override public void onOpen(JSONObject p) {
                Intent i = new Intent(PostListActivity.this, PostDetailActivity.class);
                i.putExtra("id", p.optInt("id"));
                startActivity(i);
            }
            @Override public void onLike(JSONObject p, int pos) { like(p, pos); }
            @Override public void onShare(JSONObject p) { share(p); }
            @Override public void onUser(JSONObject p) {
                Intent i = new Intent(PostListActivity.this, UserProfileActivity.class);
                i.putExtra("id", p.optInt("user_id"));
                startActivity(i);
            }
            @Override public void onVote(JSONObject p, int optionId) {
                JSONObject body = new JSONObject();
                try { body.put("option_id", optionId); } catch (Exception ignored) {}
                Api.post("/api/posts/" + p.optInt("id") + "/vote", body, new Api.Cb() {
                    @Override public void ok(JSONObject o) { toast("投票成功"); load(true); }
                    @Override public void fail(String msg) { toast(msg); }
                });
            }
        });
        adapter.setBoards(boardNames);

        RecyclerView rv = findViewById(R.id.rv);
        rv.setLayoutManager(new LinearLayoutManager(this));
        rv.setAdapter(adapter);
        rv.addOnScrollListener(new RecyclerView.OnScrollListener() {
            @Override public void onScrolled(@NonNull RecyclerView r, int dx, int dy) {
                if (dy <= 0 || loading) return;
                LinearLayoutManager lm = (LinearLayoutManager) r.getLayoutManager();
                if (lm == null) return;
                if (lm.findLastVisibleItemPosition() >= adapter.getItemCount() - 3 && page < pages) {
                    page++;
                    load(false);
                }
            }
        });

        swipe = findViewById(R.id.swipe);
        swipe.setColorSchemeColors(getResources().getColor(R.color.green));
        swipe.setOnRefreshListener(() -> load(true));

        loadBoards();
        load(true);
    }

    private void loadBoards() {
        Api.get("/api/boards", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                try {
                    JSONArray arr = Api.arr(o);
                    boardNames.clear();
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject x = arr.getJSONObject(i);
                        boardNames.put(x.optString("key"), x.optString("name"));
                    }
                    adapter.setBoards(boardNames);
                } catch (Exception ignored) {}
            }
            @Override public void fail(String msg) {}
        });
    }

    private void load(boolean reset) {
        if (loading && !reset) return;
        if (reset) page = 1;
        loading = true;
        if (reset) swipe.setRefreshing(true);
        Api.get("/api/posts?sort=latest&page=" + page + query, new Api.Cb() {
            @Override public void ok(JSONObject o) {
                loading = false;
                swipe.setRefreshing(false);
                pages = o.optInt("pages", 1);
                JSONArray arr = o.optJSONArray("posts");
                List<JSONObject> list = new ArrayList<>();
                if (arr != null) for (int i = 0; i < arr.length(); i++) {
                    JSONObject p = arr.optJSONObject(i);
                    if (p != null) list.add(p);
                }
                if (reset) adapter.setData(list); else adapter.append(list);
            }
            @Override public void fail(String msg) {
                loading = false;
                swipe.setRefreshing(false);
                toast(msg);
            }
        });
    }

    private void like(JSONObject p, int pos) {
        Api.post("/api/posts/" + p.optInt("id") + "/like", new JSONObject(), new Api.Cb() {
            @Override public void ok(JSONObject o) {
                adapter.updateLike(pos, o.optBoolean("liked"), o.optInt("likes_count"));
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void share(JSONObject p) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, p.optString("title") + "\n" + p.optString("content")
                + "\n\n来自小木社区 " + Api.BASE + "/#/post/" + p.optInt("id"));
        startActivity(Intent.createChooser(i, "分享帖子"));
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }

    @Override
    protected void onResume() {
        super.onResume();
        swipe.setRefreshing(false);
    }
}
