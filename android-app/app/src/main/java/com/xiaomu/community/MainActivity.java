package com.xiaomu.community;

import android.content.Intent;
import android.graphics.PorterDuff;
import android.os.Bundle;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;

public class MainActivity extends AppCompatActivity {
    private int current = -1;
    private int[] iconIds = {R.id.ic_home, R.id.ic_boards, R.id.ic_messages, R.id.ic_profile};
    private int[] labelIds = {R.id.tv_home, R.id.tv_boards, R.id.tv_messages, R.id.tv_profile};

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!Session.logged()) {
            startActivity(new Intent(this, LoginActivity.class));
            finish();
            return;
        }
        setContentView(R.layout.activity_main);

        findViewById(R.id.tab_home).setOnClickListener(v -> showTab(0));
        findViewById(R.id.tab_boards).setOnClickListener(v -> showTab(1));
        findViewById(R.id.tab_publish).setOnClickListener(v -> {
            if (!Session.logged()) { startActivity(new Intent(this, LoginActivity.class)); return; }
            startActivity(new Intent(this, PublishActivity.class));
        });
        findViewById(R.id.tab_messages).setOnClickListener(v -> showTab(3));
        findViewById(R.id.tab_profile).setOnClickListener(v -> showTab(4));

        showTab(0);
    }

    public void showTab(int index) {
        if (index == 2) {
            startActivity(new Intent(this, PublishActivity.class));
            return;
        }
        if (index == current) return;
        Fragment f;
        if (index == 0) f = new HomeFragment();
        else if (index == 1) f = new BoardsFragment();
        else if (index == 3) f = new MessagesFragment();
        else f = new ProfileFragment();
        getSupportFragmentManager().beginTransaction()
                .setCustomAnimations(android.R.anim.fade_in, android.R.anim.fade_out)
                .replace(R.id.container, f).commitAllowingStateLoss();
        current = index;
        updateTabs();
    }

    private void updateTabs() {
        int green = getColor(R.color.green);
        int muted = getColor(R.color.muted);
        int[] indexMap = {0, 1, 3, 4};
        for (int i = 0; i < 4; i++) {
            boolean selected = indexMap[i] == current;
            ImageView ic = findViewById(iconIds[i]);
            TextView tv = findViewById(labelIds[i]);
            ic.setColorFilter(selected ? green : muted, PorterDuff.Mode.SRC_IN);
            tv.setTextColor(selected ? green : muted);
        }
    }

    public void refreshTabs() { updateTabs(); }

    @Override
    protected void onResume() {
        super.onResume();
        if (current >= 0) updateTabs();
    }
}
