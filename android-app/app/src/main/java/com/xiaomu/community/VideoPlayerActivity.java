package com.xiaomu.community;

import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.MediaController;
import android.widget.ProgressBar;
import android.widget.Toast;
import android.widget.VideoView;

import androidx.appcompat.app.AppCompatActivity;

public class VideoPlayerActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_video_player);

        String path = getIntent().getStringExtra("video");
        if (path == null || path.isEmpty()) { finish(); return; }

        View back = findViewById(R.id.btn_back);
        back.setOnClickListener(v -> finish());

        ProgressBar loading = findViewById(R.id.video_loading);
        VideoView vv = findViewById(R.id.video_view);
        MediaController mc = new MediaController(this);
        mc.setAnchorView(vv);
        vv.setMediaController(mc);

        vv.setOnPreparedListener(mp -> {
            loading.setVisibility(View.GONE);
            mp.setLooping(false);
            mc.show();
        });
        vv.setOnErrorListener((mp, what, extra) -> {
            loading.setVisibility(View.GONE);
            Toast.makeText(this, "视频加载失败，请检查网络", Toast.LENGTH_SHORT).show();
            return true;
        });

        vv.setVideoURI(Uri.parse(Api.mediaUrl(path)));
        vv.requestFocus();
        vv.start();
    }

    @Override
    protected void onPause() {
        super.onPause();
        VideoView vv = findViewById(R.id.video_view);
        if (vv.isPlaying()) vv.pause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        VideoView vv = findViewById(R.id.video_view);
        if (!vv.isPlaying()) vv.start();
    }
}
