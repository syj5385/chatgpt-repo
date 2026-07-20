package com.syj5385.fileexplore

import android.app.Application
import android.content.Context

class FileExploreApplication : Application() {

    companion object {
        private const val PREFS_NAME = "file_explore_preferences"
        private const val PREF_SERVER_URL = "server_url"
        private const val PREF_DEFAULT_URL_APPLIED = "default_server_url_applied_v2"
        private const val DEFAULT_SERVER_URL = "https://58.232.206.129:5443"
    }

    override fun onCreate() {
        super.onCreate()

        val preferences = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!preferences.getBoolean(PREF_DEFAULT_URL_APPLIED, false)) {
            preferences.edit()
                .putString(PREF_SERVER_URL, DEFAULT_SERVER_URL)
                .putBoolean(PREF_DEFAULT_URL_APPLIED, true)
                .apply()
        }
    }
}
