package com.xiaomu.community;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class UserProfileActivity extends AppCompatActivity {

    private int userId;
    private JSONObject profile;
    private PostAdapter adapter;
    private ImageView avatar;
    private TextView title, username, meta, bio, statPosts, statFollowers, statFollowing, statPoints, btnFollow, btnFriend, btnMessage;
    private View empty;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_user_profile);
        userId = getIntent().getIntExtra("id", 0);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        title = findViewById(R.id.title);
        avatar = findViewById(R.id.avatar);
        username = findViewById(R.id.username);
        meta = findViewById(R.id.meta);
        bio = findViewById(R.id.bio);
        statPosts = findViewById(R.id.stat_posts);
        statFollowers = findViewById(R.id.stat_followers);
        statFollowing = findViewById(R.id.stat_following);
        statPoints = findViewById(R.id.stat_points);
        btnFollow = findViewById(R.id.btn_follow);
        btnFriend = findViewById(R.id.btn_friend);
        btnMessage = findViewById(R.id.btn_message);
        empty = findViewById(R.id.empty);

        adapter = new PostAdapter(new PostAdapter.Listener() {
            @Override public void onOpen(JSONObject p) {
                Intent i = new Intent(UserProfileActivity.this, PostDetailActivity.class);
                i.putExtra("id", p.optInt("id"));
                startActivity(i);
            }
            @Override public void onLike(JSONObject p, int pos) { like(p, pos); }
            @Override public void onShare(JSONObject p) { share(p); }
            @Override public void onUser(JSONObject p) {}
            @Override public void onVote(JSONObject p, int optionId) { vote(p, optionId); }
        });

        RecyclerView rv = findViewById(R.id.rv);
        rv.setLayoutManager(new LinearLayoutManager(this));
        rv.setAdapter(adapter);

        btnFollow.setOnClickListener(v -> toggleFollow());
        btnFriend.setOnClickListener(v -> friendAction());
        btnMessage.setOnClickListener(v -> openMessage());

        loadProfile();
        loadPosts();
    }

    private void loadProfile() {
        Api.get("/api/users/" + userId + "/profile", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                profile = o;
                bind();
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void bind() {
        if (profile == null) return;
        title.setText(profile.optString("username") + " 的主页");
        username.setText(profile.optString("username") + "  Lv." + Math.max(1, profile.optInt("level", 1)));
        Glide.with(this).load(Api.mediaUrl(profile.optString("avatar"))).circleCrop().into(avatar);
        String m = profile.optInt("is_developer", 0) == 1 ? "开发者" : "admin".equals(profile.optString("role")) ? "管理员" : "社区成员";
        meta.setText(m + " · 加入于 " + profile.optString("created_at", "").split(" ")[0]);
        String b = profile.optString("bio", "");
        bio.setVisibility(b.isEmpty() ? View.GONE : View.VISIBLE);
        bio.setText(b);
        statPosts.setText(String.valueOf(profile.optInt("posts_count")));
        statFollowers.setText(String.valueOf(profile.optInt("followers")));
        statFollowing.setText(String.valueOf(profile.optInt("following")));
        statPoints.setText(String.valueOf(profile.optInt("points")));

        boolean following = profile.optBoolean("is_following");
        btnFollow.setText(following ? "已关注" : "关注");
        btnFollow.setBackgroundResource(following ? R.drawable.bg_btn_gray : R.drawable.bg_btn_green);
        btnFollow.setTextColor(getResources().getColor(following ? R.color.text : R.color.white));

        String fs = profile.optString("friend_status", "none");
        btnMessage.setVisibility("friend".equals(fs) ? View.VISIBLE : View.GONE);
        if ("self".equals(fs)) {
            btnFollow.setVisibility(View.GONE);
            btnFriend.setVisibility(View.GONE);
            btnMessage.setVisibility(View.GONE);
        } else if ("friend".equals(fs)) {
            btnFriend.setText("已是好友");
        } else if ("pending_out".equals(fs)) {
            btnFriend.setText("已申请");
        } else if ("pending_in".equals(fs)) {
            btnFriend.setText("同意申请");
        } else {
            btnFriend.setText("加好友");
        }
    }

    private void loadPosts() {
        Api.get("/api/posts?sort=latest&page=1&user_id=" + userId, new Api.Cb() {
            @Override public void ok(JSONObject o) {
                JSONArray arr = o.optJSONArray("posts");
                List<JSONObject> list = new ArrayList<>();
                if (arr != null) for (int i = 0; i < arr.length(); i++) {
                    JSONObject p = arr.optJSONObject(i);
                    if (p != null) list.add(p);
                }
                adapter.setData(list);
                empty.setVisibility(list.isEmpty() ? View.VISIBLE : View.GONE);
            }
            @Override public void fail(String msg) {}
        });
    }

    private void toggleFollow() {
        Api.post("/api/users/" + userId + "/follow", new JSONObject(), new Api.Cb() {
            @Override public void ok(JSONObject o) {
                if (profile != null) {
                    try {
                        profile.put("is_following", o.optBoolean("following"));
                        profile.put("followers", o.optInt("followers"));
                    } catch (Exception ignored) {}
                    bind();
                }
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void friendAction() {
        String fs = profile == null ? "none" : profile.optString("friend_status", "none");
        if ("pending_out".equals(fs)) { toast("等待对方同意"); return; }
        if ("friend".equals(fs)) { toast("你们已经是好友"); return; }
        if ("pending_in".equals(fs)) {
            int rid = profile.optInt("friend_request_id");
            Api.post("/api/friends/requests/" + rid + "/accept", new JSONObject(), new Api.Cb() {
                @Override public void ok(JSONObject o) { toast("已添加好友"); loadProfile(); }
                @Override public void fail(String msg) { toast(msg); }
            });
            return;
        }
        Api.post("/api/friends/" + userId + "/request", new JSONObject(), new Api.Cb() {
            @Override public void ok(JSONObject o) {
                toast("friend".equals(o.optString("status")) ? "已添加好友" : "好友申请已发送");
                loadProfile();
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void openMessage() {
        Intent i = new Intent(this, PrivateChatActivity.class);
        i.putExtra("id", userId);
        i.putExtra("name", profile == null ? "私信" : profile.optString("username"));
        startActivity(i);
    }

    private void like(JSONObject p, int pos) {
        Api.post("/api/posts/" + p.optInt("id") + "/like", new JSONObject(), new Api.Cb() {
            @Override public void ok(JSONObject o) { adapter.updateLike(pos, o.optBoolean("liked"), o.optInt("likes_count")); }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void vote(JSONObject p, int optionId) {
        JSONObject body = new JSONObject();
        try { body.put("option_id", optionId); } catch (Exception ignored) {}
        Api.post("/api/posts/" + p.optInt("id") + "/vote", body, new Api.Cb() {
            @Override public void ok(JSONObject o) { toast("投票成功"); loadPosts(); }
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
}
