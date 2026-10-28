package com.xiaomu.community;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.bumptech.glide.Glide;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class HomeFragment extends Fragment {

    private PostAdapter adapter;
    private LinearLayout chipRow;
    private TextView sortLatest, sortHot;
    private SwipeRefreshLayout swipe;
    private View emptyView;
    private ImageView avatar;
    private final Map<String, String> boardNames = new HashMap<>();
    private final List<JSONObject> boards = new ArrayList<>();

    private String topic = "recommend";
    private String sort = "latest";
    private String q = "";
    private int page = 1, pages = 1;
    private boolean loading = false;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle state) {
        return inflater.inflate(R.layout.fragment_home, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View v, @Nullable Bundle state) {
        chipRow = v.findViewById(R.id.chip_row);
        sortLatest = v.findViewById(R.id.sort_latest);
        sortHot = v.findViewById(R.id.sort_hot);
        swipe = v.findViewById(R.id.swipe);
        emptyView = v.findViewById(R.id.empty);
        avatar = v.findViewById(R.id.home_avatar);

        adapter = new PostAdapter(new PostAdapter.Listener() {
            @Override public void onOpen(JSONObject p) {
                Intent i = new Intent(getActivity(), PostDetailActivity.class);
                i.putExtra("id", p.optInt("id"));
                startActivity(i);
            }
            @Override public void onLike(JSONObject p, int pos) { like(p, pos); }
            @Override public void onShare(JSONObject p) { share(p); }
            @Override public void onUser(JSONObject p) { openUser(p.optInt("user_id")); }
            @Override public void onVote(JSONObject p, int optionId) { vote(p, optionId); }
        });
        adapter.setBoards(boardNames);

        RecyclerView rv = v.findViewById(R.id.rv);
        rv.setLayoutManager(new LinearLayoutManager(getActivity()));
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

        swipe.setColorSchemeColors(getResources().getColor(R.color.green));
        swipe.setOnRefreshListener(() -> load(true));

        v.findViewById(R.id.home_search).setOnClickListener(x -> openSearch());
        v.findViewById(R.id.home_bell).setOnClickListener(x -> {
            if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).showTab(3);
        });
        avatar.setOnClickListener(x -> {
            if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).showTab(4);
        });
        sortLatest.setOnClickListener(x -> setSort("latest"));
        sortHot.setOnClickListener(x -> setSort("hot"));

        emptyView.setOnClickListener(x -> startActivity(new Intent(getActivity(), PublishActivity.class)));

        loadBoards();
        load(true);
    }

    private void setSort(String s) {
        if (sort.equals(s)) return;
        sort = s;
        sortLatest.setTextColor(getResources().getColor(s.equals("latest") ? R.color.green : R.color.muted));
        sortLatest.setTypeface(null, s.equals("latest") ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
        sortHot.setTextColor(getResources().getColor(s.equals("hot") ? R.color.green : R.color.muted));
        sortHot.setTypeface(null, s.equals("hot") ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
        load(true);
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
                    adapter.setBoards(boardNames);
                    buildChips();
                    adapter.notifyDataSetChanged();
                } catch (Exception ignored) {}
            }
            @Override public void fail(String msg) { buildChips(); }
        });
    }

    private void buildChips() {
        if (chipRow == null) return;
        chipRow.removeAllViews();
        addChip("推荐", "recommend");
        for (JSONObject b : boards) addChip(b.optString("name"), b.optString("key"));
    }

    private void addChip(String name, String key) {
        TextView tv = new TextView(getActivity());
        tv.setText(name);
        tv.setTextSize(13);
        boolean sel = key.equals(topic);
        tv.setTextColor(getResources().getColor(sel ? R.color.green : R.color.text_sub));
        tv.setBackgroundResource(sel ? R.drawable.bg_chip_sel : R.drawable.bg_chip);
        tv.setPadding(dp(14), dp(7), dp(14), dp(7));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.rightMargin = dp(8);
        tv.setLayoutParams(lp);
        tv.setOnClickListener(x -> {
            JSONObject b = findBoard(key);
            if (b != null) askBoardAccess(b); else enterBoard(key);
        });
        chipRow.addView(tv);
    }

    private JSONObject findBoard(String key) {
        for (JSONObject b : boards) if (key.equals(b.optString("key"))) return b;
        return null;
    }

    private void askBoardAccess(JSONObject b) {
        String key = b.optString("key");
        if (b.optInt("age_restricted", 0) == 1 && !Session.ageConfirmed()) {
            new MaterialAlertDialogBuilder(getActivity())
                    .setTitle("年龄提示")
                    .setMessage("「" + b.optString("name") + "」仅限年满 16 岁的用户进入。\n请确认你的年龄：")
                    .setPositiveButton("我已满16岁", (d, w) -> {
                        Session.setAgeConfirmed();
                        checkBoardPassword(b);
                    })
                    .setNegativeButton("我未满16岁", (d, w) -> toast("未满16岁不可进入该板块"))
                    .show();
            return;
        }
        checkBoardPassword(b);
    }

    private void checkBoardPassword(JSONObject b) {
        String key = b.optString("key");
        if (b.optInt("has_password", 0) != 1 || Session.boardUnlocked(key)) {
            enterBoard(key);
            return;
        }
        EditText et = new EditText(getActivity());
        et.setHint("请输入板块密码");
        et.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        new MaterialAlertDialogBuilder(getActivity())
                .setTitle("进入「" + b.optString("name") + "」")
                .setMessage("该板块需要密码才能访问")
                .setView(et)
                .setPositiveButton("进入", (d, w) -> {
                    JSONObject body = new JSONObject();
                    try { body.put("password", et.getText().toString().trim()); } catch (Exception ignored) {}
                    Api.post("/api/boards/" + b.optInt("id") + "/unlock", body, new Api.Cb() {
                        @Override public void ok(JSONObject o) { Session.unlockBoard(key); enterBoard(key); }
                        @Override public void fail(String msg) { toast(msg); }
                    });
                })
                .setNegativeButton("取消", null)
                .show();
    }

    private void enterBoard(String key) {
        topic = key;
        buildChips();
        load(true);
    }

    private void openUser(int userId) {
        if (userId <= 0) return;
        Intent i = new Intent(getActivity(), UserProfileActivity.class);
        i.putExtra("id", userId);
        startActivity(i);
    }

    private void vote(JSONObject p, int optionId) {
        JSONObject body = new JSONObject();
        try { body.put("option_id", optionId); } catch (Exception ignored) {}
        Api.post("/api/posts/" + p.optInt("id") + "/vote", body, new Api.Cb() {
            @Override public void ok(JSONObject o) { toast("投票成功"); load(true); }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void load(boolean reset) {
        if (loading && !reset) return;
        if (reset) { page = 1; }
        loading = true;
        String path = "/api/posts?topic=" + topic + "&sort=" + sort + "&page=" + page
                + (q.isEmpty() ? "" : "&q=" + android.net.Uri.encode(q));
        Api.get(path, new Api.Cb() {
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
                boolean empty = adapter.getItemCount() == 0;
                emptyView.setVisibility(empty ? View.VISIBLE : View.GONE);
                if (empty) swipe.setRefreshing(false);
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

    private void openSearch() {
        EditText et = new EditText(getActivity());
        et.setHint("输入关键词");
        et.setText(q);
        new MaterialAlertDialogBuilder(getActivity())
                .setTitle("搜索社区")
                .setView(et)
                .setPositiveButton("搜索", (d, w) -> { q = et.getText().toString().trim(); load(true); })
                .setNeutralButton("清空", (d, w) -> { q = ""; load(true); })
                .setNegativeButton("取消", null)
                .show();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (avatar != null && getActivity() != null) {
            Glide.with(this).load(Api.mediaUrl(Session.avatar())).circleCrop().into(avatar);
        }
    }

    private int dp(int v) { return PostAdapter.dp(getActivity(), v); }

    private void toast(String s) {
        if (getActivity() != null) android.widget.Toast.makeText(getActivity(), s, android.widget.Toast.LENGTH_SHORT).show();
    }
}
