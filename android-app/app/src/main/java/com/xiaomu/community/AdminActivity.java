package com.xiaomu.community;

import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.floatingactionbutton.FloatingActionButton;
import com.google.android.material.tabs.TabLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class AdminActivity extends AppCompatActivity {

    private static final String[] TAB_NAMES = {"数据概览", "用户管理", "板块管理", "帖子管理", "举报处理"};

    private TabLayout tabs;
    private RecyclerView rv;
    private SwipeRefreshLayout swipe;
    private TextView empty;
    private FloatingActionButton fab;
    private AdminAdapter adapter;
    private int currentTab = 0;
    private boolean loading = false;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (!Session.isAdmin()) { finish(); return; }
        setContentView(R.layout.activity_admin);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        tabs = findViewById(R.id.tabs);
        rv = findViewById(R.id.rv);
        swipe = findViewById(R.id.swipe);
        empty = findViewById(R.id.empty);
        fab = findViewById(R.id.fab);
        findViewById(R.id.btn_add).setOnClickListener(v -> showBoardDialog(null));

        for (String name : TAB_NAMES) tabs.addTab(tabs.newTab().setText(name));
        tabs.addOnTabSelectedListener(new TabLayout.OnTabSelectedListener() {
            @Override public void onTabSelected(TabLayout.Tab tab) { switchTab(tab.getPosition()); }
            @Override public void onTabUnselected(TabLayout.Tab tab) {}
            @Override public void onTabReselected(TabLayout.Tab tab) { load(); }
        });

        adapter = new AdminAdapter(new AdminAdapter.Listener() {
            @Override public void onUser(JSONObject user) { showUserActions(user); }
            @Override public void onBoardEdit(JSONObject board) { showBoardDialog(board); }
            @Override public void onBoardDelete(JSONObject board) { deleteBoard(board); }
            @Override public void onPostPin(JSONObject post, int pos) {
                post("/api/admin/posts/" + post.optInt("id") + "/pin", new JSONObject());
            }
            @Override public void onPostHide(JSONObject post, int pos) {
                post("/api/admin/posts/" + post.optInt("id") + "/hide", new JSONObject());
            }
            @Override public void onPostDelete(JSONObject post, int pos) { confirmDeletePost(post); }
            @Override public void onReportDelete(JSONObject report, int pos) { handleReport(report, "delete"); }
            @Override public void onReportDismiss(JSONObject report, int pos) { handleReport(report, "dismiss"); }
        });

        rv.setAdapter(adapter);
        swipe.setColorSchemeColors(getResources().getColor(R.color.green));
        swipe.setOnRefreshListener(this::load);
        fab.setOnClickListener(v -> showBoardDialog(null));

        switchTab(0);
    }

    private void switchTab(int index) {
        currentTab = index;
        if (index == 0) rv.setLayoutManager(new GridLayoutManager(this, 2));
        else rv.setLayoutManager(new LinearLayoutManager(this));
        adapter.setMode(index == 0 ? AdminAdapter.MODE_STAT
                : index == 1 ? AdminAdapter.MODE_USER
                : index == 2 ? AdminAdapter.MODE_BOARD
                : index == 3 ? AdminAdapter.MODE_POST
                : AdminAdapter.MODE_REPORT);
        fab.setVisibility(index == 2 ? View.VISIBLE : View.GONE);
        findViewById(R.id.btn_add).setVisibility(index == 2 ? View.VISIBLE : View.GONE);
        load();
    }

    private void load() {
        if (loading) return;
        loading = true;
        swipe.setRefreshing(true);
        empty.setVisibility(View.GONE);
        switch (currentTab) {
            case 0: loadStats(); break;
            case 1: loadUsers(); break;
            case 2: loadBoards(); break;
            case 3: loadPosts(); break;
            default: loadReports(); break;
        }
    }

    private void loadStats() {
        Api.get("/api/admin/stats", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                List<JSONObject> list = new ArrayList<>();
                addStat(list, o, "users", "用户总数");
                addStat(list, o, "posts", "帖子总数");
                addStat(list, o, "comments", "评论总数");
                addStat(list, o, "messages", "聊天消息");
                addStat(list, o, "today_posts", "今日发帖");
                addStat(list, o, "banned", "封禁用户");
                addStat(list, o, "muted", "禁言用户");
                addStat(list, o, "pending_reports", "待处理举报");
                done(list);
            }
            @Override public void fail(String msg) { failLoad(msg); }
        });
    }

    private void addStat(List<JSONObject> list, JSONObject o, String key, String label) {
        JSONObject item = new JSONObject();
        try {
            item.put("label", label);
            item.put("value", String.valueOf(o.optInt(key)));
        } catch (Exception ignored) {}
        list.add(item);
    }

    private void loadUsers() {
        Api.get("/api/admin/users", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                done(toList(Api.arr(o)));
            }
            @Override public void fail(String msg) { failLoad(msg); }
        });
    }

    private void loadBoards() {
        Api.get("/api/boards", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                done(toList(Api.arr(o)));
            }
            @Override public void fail(String msg) { failLoad(msg); }
        });
    }

    private void loadPosts() {
        Api.get("/api/admin/posts", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                done(toList(Api.arr(o)));
            }
            @Override public void fail(String msg) { failLoad(msg); }
        });
    }

    private void loadReports() {
        Api.get("/api/admin/reports", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                done(toList(Api.arr(o)));
            }
            @Override public void fail(String msg) { failLoad(msg); }
        });
    }

    private List<JSONObject> toList(JSONArray arr) {
        List<JSONObject> list = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject x = arr.optJSONObject(i);
            if (x != null) list.add(x);
        }
        return list;
    }

    private void done(List<JSONObject> list) {
        loading = false;
        swipe.setRefreshing(false);
        adapter.setData(list);
        boolean isEmpty = list.isEmpty();
        empty.setText(emptyText());
        empty.setVisibility(isEmpty ? View.VISIBLE : View.GONE);
    }

    private void failLoad(String msg) {
        loading = false;
        swipe.setRefreshing(false);
        toast(msg);
    }

    private String emptyText() {
        switch (currentTab) {
            case 1: return "暂无用户";
            case 2: return "暂无板块";
            case 3: return "暂无帖子";
            case 4: return "暂无举报";
            default: return "暂无数据";
        }
    }

    // ===== 用户管理 =====
    private void showUserActions(JSONObject u) {
        boolean banned = "banned".equals(u.optString("status"));
        boolean muted = !u.optString("muted_until", "").isEmpty() && isFuture(u.optString("muted_until"));
        boolean admin = "admin".equals(u.optString("role"));
        boolean canPost = u.optInt("can_post", 1) == 1;

        final String[] items = new String[]{
                banned ? "解封账号" : "封禁账号",
                muted ? "修改禁言" : "禁言",
                "解除禁言",
                canPost ? "禁止发言" : "允许发言",
                admin ? "取消管理员" : "设为管理员",
                "删除用户"
        };

        new MaterialAlertDialogBuilder(this)
                .setTitle(u.optString("username") + "  (ID " + u.optInt("id") + ")")
                .setItems(items, (d, which) -> {
                    int id = u.optInt("id");
                    switch (which) {
                        case 0: {
                            JSONObject body = new JSONObject();
                            try { body.put("ban", !banned); } catch (Exception ignored) {}
                            post("/api/admin/users/" + id + "/ban", body);
                            break;
                        }
                        case 1: showMuteDialog(id); break;
                        case 2: mute(id, 0, ""); break;
                        case 3: {
                            JSONObject body = new JSONObject();
                            try { body.put("can_post", !canPost); } catch (Exception ignored) {}
                            post("/api/admin/users/" + id + "/can-post", body);
                            break;
                        }
                        case 4: {
                            JSONObject body = new JSONObject();
                            try { body.put("role", admin ? "user" : "admin"); } catch (Exception ignored) {}
                            post("/api/admin/users/" + id + "/role", body);
                            break;
                        }
                        default: confirmDeleteUser(id, u.optString("username"));
                    }
                })
                .setNegativeButton("取消", null)
                .show();
    }

    private void showMuteDialog(int userId) {
        final String[] labels = {"10 分钟", "1 小时", "1 天", "7 天", "永久禁言"};
        final int[] minutes = {10, 60, 1440, 10080, 0};
        new MaterialAlertDialogBuilder(this)
                .setTitle("禁言时长")
                .setItems(labels, (d, which) -> askMuteReason(userId, minutes[which]))
                .setNegativeButton("取消", null)
                .show();
    }

    private void askMuteReason(int userId, int minutes) {
        View v = getLayoutInflater().inflate(R.layout.dialog_input, null);
        EditText et = v.findViewById(R.id.et_input);
        et.setHint("禁言原因（选填）");
        new MaterialAlertDialogBuilder(this)
                .setTitle(minutes == 0 ? "永久禁言" : "禁言 " + minutes + " 分钟")
                .setView(v)
                .setPositiveButton("确定", (d, w) -> mute(userId, minutes, et.getText().toString().trim()))
                .setNeutralButton("不填原因", (d, w) -> mute(userId, minutes, ""))
                .setNegativeButton("取消", null)
                .show();
    }

    private void mute(int userId, int minutes, String reason) {
        JSONObject body = new JSONObject();
        try {
            body.put("minutes", minutes);
            body.put("reason", reason);
        } catch (Exception ignored) {}
        post("/api/admin/users/" + userId + "/mute", body);
    }

    private void confirmDeleteUser(int id, String name) {
        new MaterialAlertDialogBuilder(this)
                .setTitle("删除用户")
                .setMessage("确定删除「" + name + "」？该操作不可恢复。")
                .setPositiveButton("删除", (d, w) -> {
                    Api.delete("/api/admin/users/" + id, new Api.Cb() {
                        @Override public void ok(JSONObject o) { load(); }
                        @Override public void fail(String msg) { toast(msg); }
                    });
                })
                .setNegativeButton("取消", null)
                .show();
    }

    // ===== 板块管理 =====
    private void showBoardDialog(JSONObject board) {
        boolean edit = board != null;
        View v = getLayoutInflater().inflate(R.layout.dialog_board, null);
        EditText etName = v.findViewById(R.id.et_name);
        EditText etIcon = v.findViewById(R.id.et_icon);
        EditText etDesc = v.findViewById(R.id.et_desc);
        if (edit) {
            etName.setText(board.optString("name"));
            etIcon.setText(board.optString("icon", "社"));
            etDesc.setText(board.optString("description", ""));
        }

        MaterialAlertDialogBuilder builder = new MaterialAlertDialogBuilder(this)
                .setTitle(edit ? "编辑板块" : "新建板块")
                .setView(v)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", (d, w) -> {
                    String name = etName.getText().toString().trim();
                    if (name.isEmpty()) { toast("板块名称不能为空"); return; }
                    String icon = etIcon.getText().toString().trim();
                    JSONObject body = new JSONObject();
                    try {
                        body.put("name", name);
                        body.put("icon", icon.isEmpty() ? "社" : icon);
                        body.put("description", etDesc.getText().toString().trim());
                    } catch (Exception ignored) {}
                    if (edit) {
                        Api.put("/api/admin/boards/" + board.optInt("id"), body, new Api.Cb() {
                            @Override public void ok(JSONObject o) { toast("已保存"); load(); }
                            @Override public void fail(String msg) { toast(msg); }
                        });
                    } else {
                        Api.post("/api/admin/boards", body, new Api.Cb() {
                            @Override public void ok(JSONObject o) { toast("板块已创建"); load(); }
                            @Override public void fail(String msg) { toast(msg); }
                        });
                    }
                });
        builder.show();
    }

    private void deleteBoard(JSONObject board) {
        new MaterialAlertDialogBuilder(this)
                .setTitle("删除板块")
                .setMessage("确定删除「" + board.optString("name") + "」？")
                .setPositiveButton("删除", (d, w) ->
                        Api.delete("/api/admin/boards/" + board.optInt("id"), new Api.Cb() {
                            @Override public void ok(JSONObject o) { load(); }
                            @Override public void fail(String msg) { toast(msg); }
                        }))
                .setNegativeButton("取消", null)
                .show();
    }

    // ===== 帖子管理 =====
    private void confirmDeletePost(JSONObject post) {
        new MaterialAlertDialogBuilder(this)
                .setTitle("删除帖子")
                .setMessage("确定删除该帖子？评论和点赞也会一起删除。")
                .setPositiveButton("删除", (d, w) -> {
                    Api.delete("/api/posts/" + post.optInt("id"), new Api.Cb() {
                        @Override public void ok(JSONObject o) { load(); }
                        @Override public void fail(String msg) { toast(msg); }
                    });
                })
                .setNegativeButton("取消", null)
                .show();
    }

    // ===== 举报处理 =====
    private void handleReport(JSONObject report, String action) {
        if ("delete".equals(action)) {
            new MaterialAlertDialogBuilder(this)
                    .setTitle("删除违规内容")
                    .setMessage("将删除被举报的内容并把该举报标记为已处理。")
                    .setPositiveButton("删除", (d, w) -> submitReport(report, action))
                    .setNegativeButton("取消", null)
                    .show();
        } else {
            submitReport(report, action);
        }
    }

    private void submitReport(JSONObject report, String action) {
        JSONObject body = new JSONObject();
        try { body.put("action", action); } catch (Exception ignored) {}
        Api.post("/api/admin/reports/" + report.optInt("id"), body, new Api.Cb() {
            @Override public void ok(JSONObject o) { load(); }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    // ===== 通用 =====
    private void post(String path, JSONObject body) {
        Api.post(path, body, new Api.Cb() {
            @Override public void ok(JSONObject o) { load(); }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private static boolean isFuture(String time) {
        try {
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.CHINA);
            f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            java.util.Date d = f.parse(time.replace("T", " "));
            return d != null && d.getTime() > System.currentTimeMillis();
        } catch (Exception e) {
            return false;
        }
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }
}
