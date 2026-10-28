package com.xiaomu.community;

import android.app.Application;

public class App extends Application {
    private static App instance;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        Session.init(this);
    }

    public static App get() { return instance; }
}
