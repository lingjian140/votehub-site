package com.xiaomu.community;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class PrivateChatActivity extends AppCompatActivity {
    private int otherId;
    private ChatAdapter adapter;
    private RecyclerView rv;
    private EditText input;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean polling = true;

    private final Runnable pollTask = new Runnable() {
        @Override public void run() {
            if (!polling) return;
            poll();
            handler.postDelayed(this, 4000);
        }
    };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_private_chat);
        otherId = getIntent().getIntExtra("id", 0);
        String name = getIntent().getStringExtra("name");
        ((TextView) findViewById(R.id.title)).setText(name == null ? "私信" : name);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        rv = findViewById(R.id.rv);
        input = findViewById(R.id.et_msg);
        adapter = new ChatAdapter(Session.userId());
        LinearLayoutManager lm = new LinearLayoutManager(this);
        lm.setStackFromEnd(true);
        rv.setLayoutManager(lm);
        rv.setAdapter(adapter);
        findViewById(R.id.btn_send).setOnClickListener(v -> send());

        loadInitial();
    }

    private JSONObject normalize(JSONObject m) {
        try { m.put("user_id", m.optInt("from_id")); } catch (Exception ignored) {}
        return m;
    }

    private void loadInitial() {
        Api.get("/api/messages/" + otherId, new Api.Cb() {
            @Override public void ok(JSONObject o) {
                JSONArray arr = o.optJSONArray("messages");
                List<JSONObject> list = new ArrayList<>();
                if (arr != null) for (int i = 0; i < arr.length(); i++) {
                    JSONObject m = arr.optJSONObject(i);
                    if (m != null) list.add(normalize(m));
                }
                adapter.setData(list);
                if (!list.isEmpty()) rv.scrollToPosition(list.size() - 1);
                handler.postDelayed(pollTask, 4000);
            }
            @Override public void fail(String msg) { toast(msg); }
        });
    }

    private void poll() {
        if (adapter.lastId() == 0) return;
        Api.get("/api/messages/" + otherId + "?after=" + adapter.lastId(), new Api.Cb() {
            @Override public void ok(JSONObject o) {
                JSONArray arr = o.optJSONArray("messages");
                if (arr == null || arr.length() == 0) return;
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject m = arr.optJSONObject(i);
                    if (m != null) adapter.add(normalize(m));
                }
                rv.scrollToPosition(adapter.getItemCount() - 1);
            }
            @Override public void fail(String msg) {}
        });
    }

    private void send() {
        String text = input.getText().toString().trim();
        if (text.isEmpty()) return;
        input.setText("");
        JSONObject body = new JSONObject();
        try { body.put("content", text); } catch (Exception ignored) {}
        Api.post("/api/messages/" + otherId, body, new Api.Cb() {
            @Override public void ok(JSONObject o) {
                adapter.add(normalize(o));
                rv.scrollToPosition(adapter.getItemCount() - 1);
            }
            @Override public void fail(String msg) {
                toast(msg);
                input.setText(text);
            }
        });
    }

    @Override protected void onResume() {
        super.onResume();
        polling = true;
        handler.removeCallbacks(pollTask);
        handler.postDelayed(pollTask, 4000);
    }

    @Override protected void onPause() {
        super.onPause();
        polling = false;
        handler.removeCallbacks(pollTask);
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }
}
