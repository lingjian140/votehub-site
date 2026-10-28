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
    private EditText etTitle, etContent;
    private LinearLayout imageBox, boardRow;
    private TextView btnPublish;
    private final List<File> files = new ArrayList<>();
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_publish);
        etTitle = findViewById(R.id.et_title);
        etContent = findViewById(R.id.et_content);
        imageBox = findViewById(R.id.image_box);
        boardRow = findViewById(R.id.board_row);
        btnPublish = findViewById(R.id.btn_publish);

        findViewById(R.id.btn_cancel).setOnClickListener(v -> finish());
        findViewById(R.id.btn_pick).setOnClickListener(v -> picker.launch("image/*"));

        btnPublish.setOnClickListener(v -> publish());
        loadBoards();
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
            File f = new File(getCacheDir(), "post_" + System.currentTimeMillis() + ".jpg");
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
        if (content.isEmpty()) { toast("说点什么再发布吧"); return; }
        btnPublish.setEnabled(false);
        Map<String, String> fields = new HashMap<>();
        fields.put("title", etTitle.getText().toString().trim());
        fields.put("content", content);
        fields.put("topic", topic);
        Api.upload("/api/posts", fields, files, "images", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                btnPublish.setEnabled(true);
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
