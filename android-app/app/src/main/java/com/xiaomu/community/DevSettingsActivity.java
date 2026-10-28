package com.xiaomu.community;

import android.os.Bundle;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class DevSettingsActivity extends AppCompatActivity {
    private EditText etPoints;
    private DevRewardAdapter adapter;
    private LinearLayout redemptionBox;
    private TextView empty;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (!Session.isDeveloper()) { finish(); return; }
        setContentView(R.layout.activity_dev);

        etPoints = findViewById(R.id.et_points);
        empty = findViewById(R.id.empty);
        redemptionBox = findViewById(R.id.redemption_box);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        findViewById(R.id.btn_save).setOnClickListener(v -> saveCheckin());
        findViewById(R.id.btn_add).setOnClickListener(v -> editReward(null));

        adapter = new DevRewardAdapter(new DevRewardAdapter.Listener() {
            @Override public void onEdit(JSONObject reward) { editReward(reward); }
            @Override public void onDelete(JSONObject reward) { confirmDelete(reward); }
        });
        RecyclerView rv = findViewById(R.id.rv);
        rv.setLayoutManager(new LinearLayoutManager(this));
        rv.setAdapter(adapter);
        rv.setNestedScrollingEnabled(false);

        load();
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

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }
}
