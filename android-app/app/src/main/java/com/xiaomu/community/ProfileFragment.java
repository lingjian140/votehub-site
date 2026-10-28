package com.xiaomu.community;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.bumptech.glide.Glide;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Collections;

public class ProfileFragment extends Fragment {
    private ImageView avatar;
    private TextView username, bio, statPosts, statLikes, statFollowing, statFollowers;

    private final ActivityResultLauncher<String> picker =
            registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
                if (uri != null) uploadAvatar(uri);
            });

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup c, @Nullable Bundle s) {
        return inflater.inflate(R.layout.fragment_profile, c, false);
    }

    @Override
    public void onViewCreated(@NonNull View v, @Nullable Bundle s) {
        avatar = v.findViewById(R.id.avatar);
        username = v.findViewById(R.id.username);
        bio = v.findViewById(R.id.bio);
        statPosts = v.findViewById(R.id.stat_posts);
        statLikes = v.findViewById(R.id.stat_likes);
        statFollowing = v.findViewById(R.id.stat_following);
        statFollowers = v.findViewById(R.id.stat_followers);

        boolean admin = Session.isAdmin();
        v.findViewById(R.id.menu_admin).setVisibility(admin ? View.VISIBLE : View.GONE);
        v.findViewById(R.id.divider_admin).setVisibility(admin ? View.VISIBLE : View.GONE);

        v.findViewById(R.id.menu_posts).setOnClickListener(x -> openList("我的帖子", -1));
        v.findViewById(R.id.menu_liked).setOnClickListener(x -> openLiked());
        v.findViewById(R.id.menu_avatar).setOnClickListener(x -> picker.launch("image/*"));
        v.findViewById(R.id.menu_bio).setOnClickListener(x -> editBio());
        v.findViewById(R.id.menu_pwd).setOnClickListener(x -> editPassword());
        v.findViewById(R.id.menu_admin).setOnClickListener(x ->
                startActivity(new Intent(getActivity(), AdminActivity.class)));
        v.findViewById(R.id.menu_logout).setOnClickListener(x -> logout());

        username.setText(Session.username());
        Glide.with(this).load(Api.mediaUrl(Session.avatar())).circleCrop().into(avatar);
    }

    private void openList(String title, int userId) {
        Intent i = new Intent(getActivity(), PostListActivity.class);
        i.putExtra("title", title);
        i.putExtra("user_id", userId < 0 ? Session.userId() : userId);
        startActivity(i);
    }

    private void openLiked() {
        Intent i = new Intent(getActivity(), PostListActivity.class);
        i.putExtra("title", "我赞过的");
        i.putExtra("liked_by", Session.userId());
        startActivity(i);
    }

    private void editBio() {
        EditText et = new EditText(getActivity());
        et.setHint("一句话介绍自己");
        String cur = bio.getText().toString();
        if (!cur.startsWith("这个人很懒")) et.setText(cur);
        new MaterialAlertDialogBuilder(getActivity()).setTitle("修改签名").setView(et)
                .setPositiveButton("保存", (d, w) -> {
                    JSONObject body = new JSONObject();
                    try { body.put("bio", et.getText().toString().trim()); } catch (Exception ignored) {}
                    Api.post("/api/me/profile", body, new Api.Cb() {
                        @Override public void ok(JSONObject o) { load(); }
                        @Override public void fail(String msg) { toast(msg); }
                    });
                }).setNegativeButton("取消", null).show();
    }

    private void editPassword() {
        LinearLayout box = new LinearLayout(getActivity());
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(40, 10, 40, 0);
        EditText oldPwd = new EditText(getActivity());
        oldPwd.setHint("原密码");
        EditText newPwd = new EditText(getActivity());
        newPwd.setHint("新密码（至少4位）");
        box.addView(oldPwd);
        box.addView(newPwd);
        new MaterialAlertDialogBuilder(getActivity()).setTitle("修改密码").setView(box)
                .setPositiveButton("保存", (d, w) -> {
                    JSONObject body = new JSONObject();
                    try {
                        body.put("old_password", oldPwd.getText().toString());
                        body.put("new_password", newPwd.getText().toString());
                    } catch (Exception ignored) {}
                    Api.post("/api/me/password", body, new Api.Cb() {
                        @Override public void ok(JSONObject o) { toast("密码已修改"); }
                        @Override public void fail(String msg) { toast(msg); }
                    });
                }).setNegativeButton("取消", null).show();
    }

    private void uploadAvatar(Uri uri) {
        File f = copyToCache(uri);
        if (f == null) { toast("读取图片失败"); return; }
        Api.upload("/api/avatar", null, Collections.singletonList(f), "avatar", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                String av = o.optString("avatar");
                JSONObject u = Session.user();
                try { u.put("avatar", av); } catch (Exception ignored) {}
                Session.updateUser(u);
                Glide.with(ProfileFragment.this).load(Api.mediaUrl(av)).circleCrop().into(avatar);
                toast("头像已更新");
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private File copyToCache(Uri uri) {
        try {
            InputStream in = getActivity().getContentResolver().openInputStream(uri);
            if (in == null) return null;
            String mime = getActivity().getContentResolver().getType(uri);
            String ext = ".jpg";
            if ("image/png".equals(mime)) ext = ".png";
            else if ("image/gif".equals(mime)) ext = ".gif";
            else if ("image/webp".equals(mime)) ext = ".webp";
            else if ("image/heic".equals(mime) || "image/heif".equals(mime)) ext = ".heic";
            File f = new File(getActivity().getCacheDir(), "avatar_" + System.currentTimeMillis() + ext);
            FileOutputStream out = new FileOutputStream(f);
            byte[] buf = new byte[8192];
            int len;
            while ((len = in.read(buf)) > 0) out.write(buf, 0, len);
            out.close();
            in.close();
            return f;
        } catch (Exception e) {
            return null;
        }
    }

    private void logout() {
        new MaterialAlertDialogBuilder(getActivity()).setTitle("退出登录").setMessage("确定要退出吗？")
                .setPositiveButton("退出", (d, w) -> {
                    Session.clear();
                    Intent i = new Intent(getActivity(), LoginActivity.class);
                    i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                    startActivity(i);
                    getActivity().finish();
                }).setNegativeButton("取消", null).show();
    }

    private void load() {
        Api.get("/api/users/" + Session.userId() + "/profile", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                username.setText(o.optString("username", Session.username()));
                String b = o.optString("bio", "");
                bio.setText(b.isEmpty() ? "这个人很懒，什么都没留下" : b);
                statPosts.setText(String.valueOf(o.optInt("posts_count")));
                statLikes.setText(String.valueOf(o.optInt("likes_received")));
                statFollowing.setText(String.valueOf(o.optInt("following")));
                statFollowers.setText(String.valueOf(o.optInt("followers")));
            }
            @Override public void fail(String msg) {}
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        load();
        if (avatar != null) Glide.with(this).load(Api.mediaUrl(Session.avatar())).circleCrop().into(avatar);
    }

    private void toast(String s) {
        if (getActivity() != null) Toast.makeText(getActivity(), s, Toast.LENGTH_SHORT).show();
    }
}
