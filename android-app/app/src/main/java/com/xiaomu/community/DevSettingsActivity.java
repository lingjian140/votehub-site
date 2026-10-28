package com.xiaomu.community;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public class DevSettingsActivity extends AppCompatActivity {
    private EditText etPoints;
    private DevRewardAdapter adapter;
    private LinearLayout redemptionBox, titleBox, userBox;
    private TextView empty, importResult;
    private final List<JSONObject> titles = new ArrayList<>();

    private final ActivityResultLauncher<String> importLauncher =
            registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
                if (uri != null) doImport(uri);
            });

    private final ActivityResultLauncher<String> exportJsonLauncher =
            registerForActivityResult(new ActivityResultContracts.CreateDocument("application/json"), uri -> {
                if (uri != null) doExport(uri, "/api/dev/export");
            });

    private final ActivityResultLauncher<String> exportCsvLauncher =
            registerForActivityResult(new ActivityResultContracts.CreateDocument("text/csv"), uri -> {
                if (uri != null) doExport(uri, "/api/dev/export.csv");
            });

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (!Session.isDeveloper()) { finish(); return; }
        setContentView(R.layout.activity_dev);

        etPoints = findViewById(R.id.et_points);
        empty = findViewById(R.id.empty);
        redemptionBox = findViewById(R.id.redemption_box);
        titleBox = findViewById(R.id.title_box);
        userBox = findViewById(R.id.user_box);
        importResult = findViewById(R.id.import_result);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        findViewById(R.id.btn_save).setOnClickListener(v -> saveCheckin());
        findViewById(R.id.btn_add).setOnClickListener(v -> editReward(null));
        findViewById(R.id.btn_add_title).setOnClickListener(v -> editTitle(null));
        findViewById(R.id.btn_export_json).setOnClickListener(v -> exportJsonLauncher.launch("xiaomu-accounts.json"));
        findViewById(R.id.btn_export_csv).setOnClickListener(v -> exportCsvLauncher.launch("xiaomu-accounts.csv"));
        findViewById(R.id.btn_import_json).setOnClickListener(v -> importLauncher.launch("application/json"));

        adapter = new DevRewardAdapter(new DevRewardAdapter.Listener() {
            @Override public void onEdit(JSONObject reward) { editReward(reward); }
            @Override public void onDelete(JSONObject reward) { confirmDelete(reward); }
        });
        RecyclerView rv = findViewById(R.id.rv);
        rv.setLayoutManager(new LinearLayoutManager(this));
        rv.setAdapter(adapter);
        rv.setNestedScrollingEnabled(false);

        load();
        loadTitles();
        loadUsers();
    }

    private void load() {
        Api.get("/api/admin/rewards", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                etPoints.setText(String.valueOf(o.optInt("checkin_points", 10)));
                JSONArray arr = o.optJSONArray("rewards");
                List<JSONObject> list = new ArrayList<>();
                if (arr != null) for (int i = 0; i < arr.length(); i++) {
                    JSONObject r = arr.optJSONObject(i);
                    if (r != null) list.add(r);
                }
                adapter.setData(list);
                empty.setVisibility(list.isEmpty() ? View.VISIBLE : View.GONE);
                renderRedemptions(o.optJSONArray("redemptions"));
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void renderRedemptions(JSONArray arr) {
        redemptionBox.removeAllViews();
        if (arr == null || arr.length() == 0) {
            TextView tv = new TextView(this);
            tv.setText("暂无兑换记录");
            tv.setTextColor(getColor(R.color.muted));
            tv.setTextSize(12);
            tv.setPadding(0, 8, 0, 8);
            redemptionBox.addView(tv);
            return;
        }
        for (int i = 0; i < Math.min(arr.length(), 20); i++) {
            JSONObject r = arr.optJSONObject(i);
            if (r == null) continue;
            TextView tv = new TextView(this);
            tv.setText("· " + r.optString("username", "用户") + " 兑换了「" + r.optString("reward_title")
                    + "」 -" + r.optInt("cost") + " 积分");
            tv.setTextColor(getColor(R.color.text_sub));
            tv.setTextSize(12);
            tv.setPadding(0, 6, 0, 6);
            redemptionBox.addView(tv);
        }
    }

    private void saveCheckin() {
        JSONObject body = new JSONObject();
        try { body.put("points", Integer.parseInt(etPoints.getText().toString().trim())); }
        catch (Exception e) { toast("请输入数字"); return; }
        Api.put("/api/admin/settings/checkin", body, new Api.Cb() {
            @Override public void ok(JSONObject o) { toast("签到积分已更新"); }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void editReward(JSONObject reward) {
        boolean edit = reward != null;
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(40, 10, 40, 0);

        EditText etTitle = new EditText(this);
        etTitle.setHint("商品名称");
        EditText etDesc = new EditText(this);
        etDesc.setHint("商品说明（选填）");
        EditText etIcon = new EditText(this);
        etIcon.setHint("图标文字（1个字，选填）");
        EditText etCost = new EditText(this);
        etCost.setHint("所需积分");
        etCost.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        EditText etStock = new EditText(this);
        etStock.setHint("库存（-1 表示不限）");
        etStock.setInputType(android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_FLAG_SIGNED);

        box.addView(etTitle);
        box.addView(etDesc);
        box.addView(etIcon);
        box.addView(etCost);
        box.addView(etStock);

        if (edit) {
            etTitle.setText(reward.optString("title"));
            etDesc.setText(reward.optString("description"));
            etIcon.setText(reward.optString("icon"));
            etCost.setText(String.valueOf(reward.optInt("cost")));
            etStock.setText(String.valueOf(reward.optInt("stock", -1)));
        }

        new MaterialAlertDialogBuilder(this)
                .setTitle(edit ? "编辑商品" : "新增商品")
                .setView(box)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", (d, w) -> {
                    String title = etTitle.getText().toString().trim();
                    if (title.isEmpty()) { toast("商品名称必填"); return; }
                    JSONObject body = new JSONObject();
                    try {
                        body.put("title", title);
                        body.put("description", etDesc.getText().toString().trim());
                        body.put("icon", etIcon.getText().toString().trim());
                        body.put("cost", parseInt(etCost.getText().toString(), 100));
                        body.put("stock", parseInt(etStock.getText().toString(), -1));
                        if (edit) body.put("enabled", reward.optInt("enabled", 1));
                    } catch (Exception ignored) {}
                    if (edit) {
                        Api.put("/api/admin/rewards/" + reward.optInt("id"), body, new Api.Cb() {
                            @Override public void ok(JSONObject o) { toast("已保存"); load(); }
                            @Override public void fail(String msg) { toast(msg); }
                        });
                    } else {
                        Api.post("/api/admin/rewards", body, new Api.Cb() {
                            @Override public void ok(JSONObject o) { toast("已新增"); load(); }
                            @Override public void fail(String msg) { toast(msg); }
                        });
                    }
                }).show();
    }

    private int parseInt(String s, int def) {
        try { return Integer.parseInt(s.trim()); } catch (Exception e) { return def; }
    }

    private void confirmDelete(JSONObject reward) {
        new MaterialAlertDialogBuilder(this)
                .setTitle("删除商品")
                .setMessage("确定删除「" + reward.optString("title") + "」？")
                .setPositiveButton("删除", (d, w) ->
                        Api.delete("/api/admin/rewards/" + reward.optInt("id"), new Api.Cb() {
                            @Override public void ok(JSONObject o) { load(); }
                            @Override public void fail(String msg) { toast(msg); }
                        }))
                .setNegativeButton("取消", null).show();
    }

    private void loadTitles() {
        Api.get("/api/titles", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                titles.clear();
                JSONArray arr = Api.arr(o);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject t = arr.optJSONObject(i);
                    if (t != null) titles.add(t);
                }
                renderTitles();
            }
            @Override public void fail(String msg) {}
        });
    }

    private void renderTitles() {
        titleBox.removeAllViews();
        if (titles.isEmpty()) {
            TextView tv = new TextView(this);
            tv.setText("暂无头衔");
            tv.setTextColor(getColor(R.color.muted));
            tv.setTextSize(12);
            tv.setPadding(0, dp(8), 0, dp(8));
            titleBox.addView(tv);
            return;
        }
        for (JSONObject t : titles) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(android.view.Gravity.CENTER_VERTICAL);
            row.setPadding(0, dp(6), 0, dp(6));

            TextView name = new TextView(this);
            name.setText(t.optString("name"));
            name.setTextSize(13);
            try {
                name.setTextColor(android.graphics.Color.parseColor(t.optString("color", "#00B34F")));
            } catch (Exception ignored) {}
            name.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            row.addView(name);

            TextView edit = new TextView(this);
            edit.setText("编辑");
            edit.setTextSize(12);
            edit.setTextColor(getColor(R.color.green));
            edit.setPadding(dp(10), dp(4), dp(10), dp(4));
            edit.setOnClickListener(v -> editTitle(t));
            row.addView(edit);

            TextView del = new TextView(this);
            del.setText("删除");
            del.setTextSize(12);
            del.setTextColor(getColor(R.color.muted));
            del.setPadding(dp(10), dp(4), dp(10), dp(4));
            del.setOnClickListener(v -> confirmDeleteTitle(t));
            row.addView(del);

            titleBox.addView(row);
        }
    }

    private void editTitle(JSONObject t) {
        boolean isEdit = t != null;
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(40), dp(10), dp(40), 0);

        EditText etName = new EditText(this);
        etName.setHint("头衔名称（最多20字）");
        EditText etColor = new EditText(this);
        etColor.setHint("颜色，如 #FF5722");
        if (isEdit) {
            etName.setText(t.optString("name"));
            etColor.setText(t.optString("color"));
        }
        box.addView(etName);
        box.addView(etColor);

        new MaterialAlertDialogBuilder(this)
                .setTitle(isEdit ? "修改头衔" : "新增头衔")
                .setView(box)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", (d, w) -> {
                    String name = etName.getText().toString().trim();
                    if (name.isEmpty()) { toast("头衔名称必填"); return; }
                    String color = etColor.getText().toString().trim();
                    if (color.isEmpty()) color = "#00B34F";
                    JSONObject body = new JSONObject();
                    try {
                        body.put("name", name);
                        body.put("color", color);
                    } catch (Exception ignored) {}
                    if (isEdit) {
                        Api.put("/api/dev/titles/" + t.optInt("id"), body, new Api.Cb() {
                            @Override public void ok(JSONObject o) { toast("已保存"); loadTitles(); loadUsers(); }
                            @Override public void fail(String msg) { toast(msg); }
                        });
                    } else {
                        Api.post("/api/dev/titles", body, new Api.Cb() {
                            @Override public void ok(JSONObject o) { toast("已新增"); loadTitles(); }
                            @Override public void fail(String msg) { toast(msg); }
                        });
                    }
                }).show();
    }

    private void confirmDeleteTitle(JSONObject t) {
        new MaterialAlertDialogBuilder(this)
                .setTitle("删除头衔")
                .setMessage("确定删除「" + t.optString("name") + "」？已拥有该头衔的用户将变为无头衔。")
                .setPositiveButton("删除", (d, w) -> Api.delete("/api/dev/titles/" + t.optInt("id"), new Api.Cb() {
                    @Override public void ok(JSONObject o) { loadTitles(); loadUsers(); }
                    @Override public void fail(String msg) { toast(msg); }
                }))
                .setNegativeButton("取消", null).show();
    }

    private void loadUsers() {
        Api.get("/api/dev/users", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                userBox.removeAllViews();
                JSONArray arr = Api.arr(o);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject u = arr.optJSONObject(i);
                    if (u == null) continue;
                    TextView tv = new TextView(DevSettingsActivity.this);
                    String title = u.optString("title", "");
                    tv.setText(u.optString("username") + " · Lv." + u.optInt("level", 1)
                            + " · " + u.optInt("points", 0) + " 积分"
                            + (title.isEmpty() ? "" : " · " + title));
                    tv.setTextSize(13);
                    tv.setTextColor(getColor(R.color.text));
                    tv.setPadding(0, dp(9), 0, dp(9));
                    tv.setOnClickListener(v -> editUser(u));
                    userBox.addView(tv);
                }
                if (arr.length() == 0) {
                    TextView tv = new TextView(DevSettingsActivity.this);
                    tv.setText("暂无用户");
                    tv.setTextColor(getColor(R.color.muted));
                    tv.setTextSize(12);
                    userBox.addView(tv);
                }
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void editUser(JSONObject u) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(40), dp(10), dp(40), 0);

        EditText etLv = new EditText(this);
        etLv.setHint("等级 1-99");
        etLv.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        etLv.setText(String.valueOf(u.optInt("level", 1)));

        EditText etPts = new EditText(this);
        etPts.setHint("积分");
        etPts.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        etPts.setText(String.valueOf(u.optInt("points", 0)));

        final int[] selectedTitle = {u.optInt("title_id", 0)};
        TextView btnTitle = new TextView(this);
        btnTitle.setText("头衔：" + (u.optString("title").isEmpty() ? "无" : u.optString("title")));
        btnTitle.setTextColor(getColor(R.color.green));
        btnTitle.setTextSize(14);
        btnTitle.setPadding(0, dp(12), 0, dp(12));
        btnTitle.setOnClickListener(v -> {
            List<String> names = new ArrayList<>();
            names.add("无头衔");
            for (JSONObject t : titles) names.add(t.optString("name"));
            new MaterialAlertDialogBuilder(this).setTitle("选择头衔")
                    .setItems(names.toArray(new String[0]), (d, w) -> {
                        if (w == 0) selectedTitle[0] = 0;
                        else selectedTitle[0] = titles.get(w - 1).optInt("id");
                        btnTitle.setText("头衔：" + names.get(w));
                    }).show();
        });

        box.addView(etLv);
        box.addView(etPts);
        box.addView(btnTitle);

        new MaterialAlertDialogBuilder(this)
                .setTitle("修改用户：" + u.optString("username"))
                .setView(box)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", (d, w) -> {
                    JSONObject body = new JSONObject();
                    try {
                        body.put("level", parseInt(etLv.getText().toString(), u.optInt("level", 1)));
                        body.put("points", parseInt(etPts.getText().toString(), u.optInt("points", 0)));
                        body.put("title_id", selectedTitle[0]);
                    } catch (Exception ignored) {}
                    Api.post("/api/dev/users/" + u.optInt("id"), body, new Api.Cb() {
                        @Override public void ok(JSONObject o) { toast("已保存"); loadUsers(); }
                        @Override public void fail(String msg) { toast(msg); }
                    });
                }).show();
    }

    private void doExport(Uri uri, String path) {
        Api.getBytes(path, new Api.BytesCb() {
            @Override public void ok(byte[] data) {
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out == null) { toast("保存失败"); return; }
                    out.write(data);
                    out.flush();
                    toast("已导出（" + data.length + " 字节）");
                } catch (Exception e) {
                    toast("保存失败");
                }
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void doImport(Uri uri) {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) { toast("无法读取该文件"); return; }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            JSONObject obj = new JSONObject(new String(bos.toByteArray(), "UTF-8"));
            new MaterialAlertDialogBuilder(this)
                    .setTitle("导入账号数据")
                    .setMessage("将合并导入：已存在的账号按 id / 用户名更新，不会删除现有账号。继续？")
                    .setPositiveButton("导入", (d, w) -> {
                        JSONObject body = new JSONObject();
                        try { body.put("data", obj); } catch (Exception ignored) {}
                        Api.post("/api/dev/import", body, new Api.Cb() {
                            @Override public void ok(JSONObject o) {
                                JSONObject users = o.optJSONObject("users");
                                int ins = users == null ? 0 : users.optInt("inserted");
                                int upd = users == null ? 0 : users.optInt("updated");
                                int skip = users == null ? 0 : users.optInt("skipped");
                                String msg = "导入完成：新增 " + ins + "，更新 " + upd + "，跳过 " + skip;
                                importResult.setText(msg);
                                toast(msg);
                                loadTitles();
                                loadUsers();
                            }
                            @Override public void fail(String msg) { toast(msg); }
                        });
                    })
                    .setNegativeButton("取消", null).show();
        } catch (Exception e) {
            toast("无法读取该文件");
        }
    }

    private int dp(int v) { return PostAdapter.dp(this, v); }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }
}
