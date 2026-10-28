package com.xiaomu.community;

import android.os.Bundle;
import android.view.View;
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

public class CheckinActivity extends AppCompatActivity {
    private TextView tvLevel, tvPoints, tvStreak, tvReward, btnCheckin, empty;
    private RewardAdapter adapter;
    private boolean checked = false;
    private int points = 0, level = 1;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_checkin);

        tvLevel = findViewById(R.id.tv_level);
        tvPoints = findViewById(R.id.tv_points);
        tvStreak = findViewById(R.id.tv_streak);
        tvReward = findViewById(R.id.tv_reward);
        btnCheckin = findViewById(R.id.btn_checkin);
        empty = findViewById(R.id.empty);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());

        adapter = new RewardAdapter(this::confirmRedeem);
        RecyclerView rv = findViewById(R.id.rv);
        rv.setLayoutManager(new LinearLayoutManager(this));
        rv.setAdapter(adapter);
        rv.setNestedScrollingEnabled(false);

        btnCheckin.setOnClickListener(v -> checkin());
        loadCheckin();
        loadRewards();
    }

    private void loadCheckin() {
        Api.get("/api/checkin", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                checked = o.optBoolean("checked");
                points = o.optInt("points", 0);
                level = o.optInt("level", 1);
                render(o.optInt("reward", 10), o.optInt("streak", 0), o.optInt("total_days", 0));
                Session.updatePoints(points, level);
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void render(int reward, int streak, int totalDays) {
        tvLevel.setText("Lv." + Math.max(1, level));
        tvPoints.setText(points + " 积分 · 累计签到 " + totalDays + " 天");
        tvStreak.setText("连续签到 " + streak + " 天");
        tvReward.setText(checked ? "今日已签到，明天再来" : "每日签到可得 " + reward + " 积分");
        btnCheckin.setText(checked ? "已签到" : "立即签到");
        btnCheckin.setEnabled(!checked);
        btnCheckin.setAlpha(checked ? 0.6f : 1f);
    }

    private void checkin() {
        btnCheckin.setEnabled(false);
        Api.post("/api/checkin", new JSONObject(), new Api.Cb() {
            @Override public void ok(JSONObject o) {
                checked = true;
                points = o.optInt("points", points);
                level = o.optInt("level", level);
                Session.updatePoints(points, level);
                render(points, o.optInt("streak", 0), 0);
                btnCheckin.setEnabled(false);
                loadCheckin();
                toast("签到成功，+" + o.optInt("gained") + " 积分");
            }
            @Override public void fail(String msg) {
                btnCheckin.setEnabled(true);
                toast(msg);
            }
        });
    }

    private void loadRewards() {
        Api.get("/api/rewards", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                JSONArray arr = o.optJSONArray("rewards");
                List<JSONObject> list = new ArrayList<>();
                if (arr != null) for (int i = 0; i < arr.length(); i++) {
                    JSONObject r = arr.optJSONObject(i);
                    if (r != null) list.add(r);
                }
                adapter.setData(list);
                empty.setVisibility(list.isEmpty() ? View.VISIBLE : View.GONE);
                points = o.optInt("points", points);
                level = o.optInt("level", level);
                Session.updatePoints(points, level);
                tvLevel.setText("Lv." + Math.max(1, level));
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void confirmRedeem(JSONObject r) {
        new MaterialAlertDialogBuilder(this)
                .setTitle("兑换「" + r.optString("title") + "」")
                .setMessage("将消耗 " + r.optInt("cost") + " 积分，当前 " + points + " 积分。")
                .setPositiveButton("确认兑换", (d, w) -> redeem(r))
                .setNegativeButton("取消", null)
                .show();
    }

    private void redeem(JSONObject r) {
        Api.post("/api/rewards/" + r.optInt("id") + "/redeem", new JSONObject(), new Api.Cb() {
            @Override public void ok(JSONObject o) {
                points = o.optInt("points", points);
                level = o.optInt("level", level);
                Session.updatePoints(points, level);
                tvLevel.setText("Lv." + Math.max(1, level));
                tvPoints.setText(points + " 积分");
                loadRewards();
                toast("兑换成功，可联系管理员领取奖励");
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }
}
