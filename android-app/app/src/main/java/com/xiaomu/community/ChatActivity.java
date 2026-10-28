package com.xiaomu.community;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class ChatActivity extends AppCompatActivity {
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
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_chat);
        rv = findViewById(R.id.rv);
        input = findViewById(R.id.et_msg);
        adapter = new ChatAdapter(Session.userId());
        LinearLayoutManager lm = new LinearLayoutManager(this);
        lm.setStackFromEnd(true);
        rv.setLayoutManager(lm);
        rv.setAdapter(adapter);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        findViewById(R.id.btn_send).setOnClickListener(v -> send());
        ((TextView) findViewById(R.id.online)).setText("实时聊天");

        loadInitial();
    }

    private void loadInitial() {
        Api.get("/api/chat", new Api.Cb() {
            @Override public void ok(JSONObject o) {
                JSONArray arr = o.optJSONArray("messages");
                List<JSONObject> list = new ArrayList<>();
                if (arr != null) for (int i = 0; i < arr.length(); i++) {
                    JSONObject m = arr.optJSONObject(i);
                    if (m != null) list.add(m);
                }
                adapter.setData(list);
                if (!list.isEmpty()) rv.scrollToPosition(list.size() - 1);
                handler.postDelayed(pollTask, 4000);
            }
            @Override public void fail(String msg) {
                Toast.makeText(ChatActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void poll() {
        Api.get("/api/chat?after=" + adapter.lastId(), new Api.Cb() {
            @Override public void ok(JSONObject o) {
                JSONArray arr = o.optJSONArray("messages");
                if (arr == null || arr.length() == 0) return;
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject m = arr.optJSONObject(i);
                    if (m != null) adapter.add(m);
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
        Api.post("/api/chat", body, new Api.Cb() {
            @Override public void ok(JSONObject o) {
                adapter.add(o);
                rv.scrollToPosition(adapter.getItemCount() - 1);
            }
            @Override public void fail(String msg) {
                Toast.makeText(ChatActivity.this, msg, Toast.LENGTH_SHORT).show();
                input.setText(text);
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        polling = true;
        handler.removeCallbacks(pollTask);
        handler.postDelayed(pollTask, 4000);
    }

    @Override
    protected void onPause() {
        super.onPause();
        polling = false;
        handler.removeCallbacks(pollTask);
    }
}
