package com.xiaomu.community;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.bumptech.glide.Glide;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

public class PostDetailActivity extends AppCompatActivity {
    private int postId;
    private JSONObject post;
    private final Map<String, String> boards = new HashMap<>();
    private LinearLayout commentBox;
    private TextView commentTitle, noComment, likeBtn, followBtn, views;
    private EditText input;
    private boolean following = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_post_detail);
        postId = getIntent().getIntExtra("id", 0);

        commentBox = findViewById(R.id.comment_box);
        commentTitle = findViewById(R.id.comment_title);
        noComment = findViewById(R.id.no_comment);
        likeBtn = findViewById(R.id.p_like);
        followBtn = findViewById(R.id.p_follow);
        views = findViewById(R.id.p_views);
        input = findViewById(R.id.comment_input);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        findViewById(R.id.btn_send).setOnClickListener(v -> sendComment());
        findViewById(R.id.btn_more).setOnClickListener(v -> showMore());
        likeBtn.setOnClickListener(v -> toggleLike());
        followBtn.setOnClickListener(v -> toggleFollow());
        findViewById(R.id.p_share).setOnClickListener(v -> share());
        findViewById(R.id.p_avatar).setOnClickListener(v -> openUser());

        loadBoards();
        load();
    }

    private void loadBoards() {
        Api.get("/api/boards", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                try {
                    JSONArray arr = Api.arr(o);
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject b = arr.getJSONObject(i);
                        boards.put(b.optString("key"), b.optString("name"));
                    }
                    if (post != null) {
                        TextView pb = findViewById(R.id.p_board);
                        pb.setText(boards.getOrDefault(post.optString("topic"), "社区"));
                    }
                } catch (Exception ignored) {}
            }
            @Override public void fail(String msg) {}
        });
    }

    private void load() {
        Api.get("/api/posts/" + postId, new Api.Cb() {
            @Override public void ok(JSONObject o) {
                post = o;
                bind();
            }
            @Override public void fail(String msg) {
                Toast.makeText(PostDetailActivity.this, msg, Toast.LENGTH_SHORT).show();
                finish();
            }
        });
    }

    private void bind() {
        ((TextView) findViewById(R.id.p_username)).setText(
                post.optString("username") + " · Lv." + Math.max(1, post.optInt("user_level", 1)));
        ((TextView) findViewById(R.id.p_time)).setText(TimeUtil.ago(post.optString("created_at")));
        Glide.with(this).load(Api.mediaUrl(post.optString("avatar"))).circleCrop()
                .into((ImageView) findViewById(R.id.p_avatar));

        String title = post.optString("title");
        TextView tvTitle = findViewById(R.id.p_title);
        tvTitle.setVisibility(title.isEmpty() ? View.GONE : View.VISIBLE);
        tvTitle.setText(title);
        ((TextView) findViewById(R.id.p_content)).setText(post.optString("content"));

        PostAdapter.bindImages(findViewById(R.id.p_images), post.optJSONArray("images"), this);

        TextView video = findViewById(R.id.p_video);
        String videoPath = post.optString("video", "");
        video.setVisibility(videoPath.isEmpty() ? View.GONE : View.VISIBLE);
        video.setOnClickListener(v -> {
            try {
                Intent it = new Intent(Intent.ACTION_VIEW);
                it.setDataAndType(android.net.Uri.parse(Api.mediaUrl(videoPath)), "video/*");
                it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(it);
            } catch (Exception ignored) { toast("无法播放该视频"); }
        });

        bindPoll();

        ((TextView) findViewById(R.id.p_board)).setText(boards.getOrDefault(post.optString("topic"), "社区"));
        views.setText("浏览 " + post.optInt("views_count", 0));
        updateLike();

        boolean self = post.optInt("user_id") == Session.userId();
        followBtn.setVisibility(self ? View.GONE : View.VISIBLE);

        commentTitle.setText("评论 " + post.optInt("comments_count", 0));
        commentBox.removeAllViews();
        JSONArray cs = post.optJSONArray("comments");
        noComment.setVisibility(cs == null || cs.length() == 0 ? View.VISIBLE : View.GONE);
        if (cs != null) for (int i = 0; i < cs.length(); i++) addCommentView(cs.optJSONObject(i), false);
    }

    private void bindPoll() {
        PostAdapter.bindPoll(findViewById(R.id.p_poll), post.optJSONObject("poll"),
                post, new PostAdapter.Listener() {
                    @Override public void onOpen(JSONObject p) {}
                    @Override public void onLike(JSONObject p, int position) {}
                    @Override public void onShare(JSONObject p) {}
                    @Override public void onUser(JSONObject p) {}
                    @Override public void onVote(JSONObject p, int optionId) { vote(optionId); }
                }, this);
    }

    private void vote(int optionId) {
        JSONObject body = new JSONObject();
        try { body.put("option_id", optionId); } catch (Exception ignored) {}
        Api.post("/api/posts/" + postId + "/vote", body, new Api.Cb() {
            @Override public void ok(JSONObject o) { toast("投票成功"); load(); }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void updateLike() {
        boolean liked = post.optBoolean("liked");
        likeBtn.setText(liked ? "已赞 " + post.optInt("likes_count") : "赞 " + post.optInt("likes_count"));
        likeBtn.setTextColor(getColor(liked ? R.color.green : R.color.text_sub));
    }

    private void toggleLike() {
        Api.post("/api/posts/" + postId + "/like", new JSONObject(), new Api.Cb() {
            @Override public void ok(JSONObject o) {
                try {
                    post.put("liked", o.optBoolean("liked"));
                    post.put("likes_count", o.optInt("likes_count"));
                } catch (Exception ignored) {}
                updateLike();
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void toggleFollow() {
        int uid = post.optInt("user_id");
        Api.post("/api/users/" + uid + "/follow", new JSONObject(), new Api.Cb() {
            @Override public void ok(JSONObject o) {
                following = o.optBoolean("following");
                followBtn.setText(following ? "已关注" : "关注");
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void sendComment() {
        String text = input.getText().toString().trim();
        if (text.isEmpty()) return;
        JSONObject body = new JSONObject();
        try { body.put("content", text); } catch (Exception ignored) {}
        Api.post("/api/posts/" + postId + "/comments", body, new Api.Cb() {
            @Override public void ok(JSONObject o) {
                input.setText("");
                addCommentView(o, true);
                noComment.setVisibility(View.GONE);
                int c = post.optInt("comments_count") + 1;
                try { post.put("comments_count", c); } catch (Exception ignored) {}
                commentTitle.setText("评论 " + c);
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void addCommentView(JSONObject c, boolean append) {
        if (c == null) return;
        View v = LayoutInflater.from(this).inflate(R.layout.item_comment, commentBox, false);
        ((TextView) v.findViewById(R.id.username)).setText(c.optString("username", "匿名"));
        ((TextView) v.findViewById(R.id.content)).setText(c.optString("content"));
        ((TextView) v.findViewById(R.id.time)).setText(TimeUtil.ago(c.optString("created_at")));
        Glide.with(this).load(Api.mediaUrl(c.optString("avatar"))).circleCrop()
                .into((ImageView) v.findViewById(R.id.avatar));
        v.setOnClickListener(x -> {
            String[] reasons = {"垃圾广告", "色情低俗", "人身攻击", "违法违规", "其他"};
            new MaterialAlertDialogBuilder(this).setTitle("举报评论")
                    .setItems(reasons, (d, w) -> report("comment", c.optInt("id")))
                    .show();
        });
        commentBox.addView(v);
    }

    private void showMore() {
        boolean mine = post != null && post.optInt("user_id") == Session.userId();
        boolean canDelete = mine || Session.isAdmin();
        String[] items = canDelete ? new String[]{"分享", "举报", "删除"} : new String[]{"分享", "举报"};
        new MaterialAlertDialogBuilder(this).setItems(items, (d, w) -> {
            if (w == 0) share();
            else if (w == 1) pickReportReason();
            else if (w == 2) deletePost();
        }).show();
    }

    private void pickReportReason() {
        String[] reasons = {"垃圾广告", "色情低俗", "人身攻击", "违法违规", "其他"};
        new MaterialAlertDialogBuilder(this).setTitle("举报帖子")
                .setItems(reasons, (d, w) -> report("post", postId)).show();
    }

    private void report(String type, int targetId) {
        JSONObject body = new JSONObject();
        try {
            body.put("target_type", type);
            body.put("target_id", targetId);
            body.put("reason", "用户举报");
        } catch (Exception ignored) {}
        Api.post("/api/reports", body, new Api.Cb() {
            @Override public void ok(JSONObject o) { toast("举报成功，等待处理"); }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void deletePost() {
        new MaterialAlertDialogBuilder(this).setTitle("删除帖子").setMessage("确定删除这篇帖子吗？")
                .setPositiveButton("删除", (d, w) -> Api.delete("/api/posts/" + postId, new Api.Cb() {
                    @Override public void ok(JSONObject o) { finish(); }
                    @Override public void fail(String msg) { toast(msg); }
                }))
                .setNegativeButton("取消", null).show();
    }

    private void share() {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, post.optString("title") + "\n" + post.optString("content")
                + "\n\n来自小木社区 " + Api.BASE + "/#/post/" + postId);
        startActivity(Intent.createChooser(i, "分享帖子"));
    }

    private void openUser() {
        if (post == null) return;
        Intent i = new Intent(this, UserProfileActivity.class);
        i.putExtra("id", post.optInt("user_id"));
        startActivity(i);
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }
}
