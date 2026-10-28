package com.xiaomu.community;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONObject;

public class LoginActivity extends AppCompatActivity {
    private boolean registerMode = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);

        TextView tabLogin = findViewById(R.id.tab_login);
        TextView tabRegister = findViewById(R.id.tab_register);
        EditText etUser = findViewById(R.id.et_username);
        EditText etPass = findViewById(R.id.et_password);
        EditText etConfirm = findViewById(R.id.et_confirm);
        Button btn = findViewById(R.id.btn_submit);

        tabLogin.setOnClickListener(v -> {
            registerMode = false;
            tabLogin.setTextColor(getColor(R.color.text));
            tabLogin.setTypeface(null, android.graphics.Typeface.BOLD);
            tabRegister.setTextColor(getColor(R.color.muted));
            tabRegister.setTypeface(null, android.graphics.Typeface.NORMAL);
            etConfirm.setVisibility(View.GONE);
            btn.setText("登录");
        });

        tabRegister.setOnClickListener(v -> {
            registerMode = true;
            tabRegister.setTextColor(getColor(R.color.text));
            tabRegister.setTypeface(null, android.graphics.Typeface.BOLD);
            tabLogin.setTextColor(getColor(R.color.muted));
            tabLogin.setTypeface(null, android.graphics.Typeface.NORMAL);
            etConfirm.setVisibility(View.VISIBLE);
            btn.setText("注册并登录");
        });

        btn.setOnClickListener(v -> {
            String u = etUser.getText().toString().trim();
            String p = etPass.getText().toString();
            if (u.isEmpty() || p.isEmpty()) { toast("请输入用户名和密码"); return; }
            if (registerMode && !p.equals(etConfirm.getText().toString())) { toast("两次密码不一致"); return; }
            btn.setEnabled(false);
            JSONObject body = new JSONObject();
            try { body.put("username", u); body.put("password", p); } catch (Exception ignored) {}
            String path = registerMode ? "/api/register" : "/api/login";
            Api.post(path, body, new Api.Cb() {
                @Override public void ok(JSONObject o) {
                    btn.setEnabled(true);
                    Session.save(o.optString("token"), o.optJSONObject("user"));
                    startActivity(new Intent(LoginActivity.this, MainActivity.class));
                    finish();
                }
                @Override public void fail(String msg) {
                    btn.setEnabled(true);
                    toast(msg);
                }
            });
        });

        findViewById(R.id.btn_guest).setVisibility(View.GONE);
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }
}
