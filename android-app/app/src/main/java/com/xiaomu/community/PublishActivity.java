package com.xiaomu.community;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import com.bumptech.glide.Glide;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class PublishActivity extends AppCompatActivity {
    private EditText etTitle, etContent, etPassword;
    private LinearLayout imageBox, boardRow, optBox;
    private TextView btnPublish, tvVideo, tvPoll;
    private View llPoll;
    private final List<File> files = new ArrayList<>();
    private final List<EditText> optionInputs = new ArrayList<>();
    private File videoFile;
    private boolean pollMode = false;
    private final Map<String, String> boardNames = new HashMap<>();
    private final List<JSONObject> boards = new ArrayList<>();
    private String topic = "life";

    private final ActivityResultLauncher<String> picker =
            registerForActivityResult(new ActivityResultContracts.GetMultipleContents(), uris -> {
                if (uris == null) return;
                for (Uri uri : uris) {
                    if (files.size() >= 9) break;
                    File f = copyToCache(uri);
                    if (f != null) files.add(f);
                }
                renderImages();
            });

    private final ActivityResultLauncher<String> videoPicker =
            registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
                if (uri == null) return;
                File f = copyToCache(uri);
                if (f == null) { toast("读取视频失败"); return; }
                videoFile = f;
                tvVideo.setVisibility(View.VISIBLE);
                tvVideo.setText("已选择视频：" + f.getName() + "（点击移除）");
                tvVideo.setOnClickListener(v -> {
                    videoFile = null;
                    tvVideo.setVisibility(View.GONE);
                });
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_publish);
        etTitle = findViewById(R.id.et_title);
        etContent = findViewById(R.id.et_content);
        etPassword = findViewById(R.id.et_password);
        imageBox = findViewById(R.id.image_box);
        boardRow = findViewById(R.id.board_row);
        btnPublish = findViewById(R.id.btn_publish);
        tvVideo = findViewById(R.id.tv_video);
        tvPoll = findViewById(R.id.tv_poll);
        llPoll = findViewById(R.id.ll_poll);
        optBox = findViewById(R.id.opt_box);

        findViewById(R.id.btn_cancel).setOnClickListener(v -> finish());
        findViewById(R.id.btn_pick).setOnClickListener(v -> picker.launch("image/*"));
        findViewById(R.id.btn_pick_video).setOnClickListener(v -> videoPicker.launch("video/*"));
        findViewById(R.id.btn_poll).setOnClickListener(v -> togglePoll());
        findViewById(R.id.btn_add_opt).setOnClickListener(v -> addOption());

        optionInputs.add(findViewById(R.id.et_opt1));
        optionInputs.add(findViewById(R.id.et_opt2));

        btnPublish.setOnClickListener(v -> publish());
        loadBoards();
    }

    private void togglePoll() {
        pollMode = !pollMode;
        tvPoll.setText(pollMode ? "取消投票" : "发起投票");
        tvPoll.setTextColor(getColor(pollMode ? R.color.green : R.color.text_sub));
        llPoll.setVisibility(pollMode ? View.VISIBLE : View.GONE);
    }

    private void addOption() {
        if (optionInputs.size() >= 10) { toast("最多 10 个选项"); return; }
        EditText et = new EditText(this);
        et.setHint("选项 " + (optionInputs.size() + 1));
        et.setTextColor(getColor(R.color.text));
        et.setHintTextColor(getColor(R.color.muted));
        et.setTextSize(14);
        optBox.addView(et);
        optionInputs.add(et);
    }

    private List<String> pollOptions() {
        List<String> out = new ArrayList<>();
        for (EditText et : optionInputs) {
            String s = et.getText().toString().trim();
            if (!s.isEmpty()) out.add(s);
        }
        return out;
    }

    private void loadBoards() {
        Api.get("/api/boards", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                try {
                    JSONArray arr = Api.arr(o);
                    boards.clear();
                    boardNames.clear();
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject b = arr.getJSONObject(i);
                        boards.add(b);
                        boardNames.put(b.optString("key"), b.optString("name"));
                    }
                    if (!boards.isEmpty()) topic = boards.get(0).optString("key");
                    buildBoardChips();
                } catch (Exception ignored) {}
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void buildBoardChips() {
        boardRow.removeAllViews();
        for (JSONObject b : boards) {
            String key = b.optString("key");
            boolean sel = key.equals(topic);
            TextView tv = new TextView(this);
            tv.setText(b.optString("name"));
            tv.setTextSize(13);
            tv.setTextColor(getColor(sel ? R.color.green : R.color.text_sub));
            tv.setBackgroundResource(sel ? R.drawable.bg_chip_sel : R.drawable.bg_chip);
            tv.setPadding(dp(14), dp(7), dp(14), dp(7));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.rightMargin = dp(8);
            tv.setLayoutParams(lp);
            tv.setOnClickListener(v -> { topic = key; buildBoardChips(); });
            boardRow.addView(tv);
        }
    }

    private void renderImages() {
        imageBox.removeAllViews();
        imageBox.setOrientation(LinearLayout.HORIZONTAL);
        int size = dp(74);
        for (File f : files) {
            ImageView iv = new ImageView(this);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(size, size);
            lp.rightMargin = dp(8);
            iv.setLayoutParams(lp);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            Glide.with(this).load(f).into(iv);
            iv.setOnClickListener(v -> { files.remove(f); renderImages(); });
            imageBox.addView(iv);
        }
        findViewById(R.id.btn_pick).setVisibility(files.size() >= 9 ? View.GONE : View.VISIBLE);
    }

    private File copyToCache(Uri uri) {
        try {
            InputStream in = getContentResolver().openInputStream(uri);
            if (in == null) return null;
            String mime = getContentResolver().getType(uri);
            String ext = ".jpg";
            if ("image/png".equals(mime)) ext = ".png";
            else if ("image/gif".equals(mime)) ext = ".gif";
            else if ("image/webp".equals(mime)) ext = ".webp";
            else if ("image/heic".equals(mime) || "image/heif".equals(mime)) ext = ".heic";
            else if ("video/mp4".equals(mime)) ext = ".mp4";
            else if ("video/quicktime".equals(mime)) ext = ".mov";
            else if ("video/webm".equals(mime)) ext = ".webm";
            else if (mime != null && mime.startsWith("video/")) ext = ".mp4";
            File f = new File(getCacheDir(), "post_" + System.currentTimeMillis() + ext);
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

    private void publish() {
        String content = etContent.getText().toString().trim();
        if (pollMode) {
            if (pollOptions().size() < 2) { toast("投票至少需要 2 个选项"); return; }
        } else if (content.isEmpty()) {
            toast("说点什么再发布吧");
            return;
        }
        btnPublish.setEnabled(false);
        Map<String, String> fields = new HashMap<>();
        fields.put("title", etTitle.getText().toString().trim());
        fields.put("content", content);
        fields.put("topic", topic);
        String pwd = etPassword.getText().toString().trim();
        if (!pwd.isEmpty()) fields.put("access_password", pwd);
        if (pollMode) {
            fields.put("type", "poll");
            fields.put("question", etTitle.getText().toString().trim());
            fields.put("poll_options", new JSONArray(pollOptions()).toString());
        }
        Api.uploadPost("/api/posts", fields, files, videoFile, new Api.Cb() {
            @Override public void ok(JSONObject o) {
                btnPublish.setEnabled(true);
                if (o.has("points")) Session.updatePoints(o.optInt("points"), o.optInt("level", Session.level()));
                Toast.makeText(PublishActivity.this, "发布成功", Toast.LENGTH_SHORT).show();
                Intent i = new Intent(PublishActivity.this, PostDetailActivity.class);
                i.putExtra("id", o.optInt("id"));
                startActivity(i);
                finish();
            }
            @Override public void fail(String msg) {
                btnPublish.setEnabled(true);
                toast(msg);
            }
        });
    }

    private int dp(int v) { return PostAdapter.dp(this, v); }
    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }
}
