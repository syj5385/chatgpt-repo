package com.syj5385.fileexplore

import android.app.Activity
import android.app.Application
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.os.Bundle
import android.webkit.MimeTypeMap
import android.widget.Toast
import java.lang.ref.WeakReference
import java.util.Locale

internal object DownloadedFilePrompt : Application.ActivityLifecycleCallbacks {

    private var resumedActivity: WeakReference<Activity>? = null
    private var pendingResult: FileDownloadResult? = null

    fun offer(result: FileDownloadResult) {
        pendingResult = result
        openIfPossible()
    }

    private fun openIfPossible() {
        val activity = resumedActivity?.get() ?: return
        if (activity.isFinishing || activity.isDestroyed) return
        val result = pendingResult ?: return
        pendingResult = null
        openFileChooser(activity, result)
    }

    private fun openFileChooser(activity: Activity, result: FileDownloadResult) {
        val mimeType = resolveMimeType(result)
        val viewIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(result.uri, mimeType)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            clipData = ClipData.newUri(activity.contentResolver, result.fileName, result.uri)
        }
        val chooser = Intent.createChooser(
            viewIntent,
            activity.getString(R.string.download_open_with)
        )

        try {
            activity.startActivity(chooser)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(
                activity,
                R.string.download_open_no_app,
                Toast.LENGTH_LONG
            ).show()
        } catch (_: SecurityException) {
            Toast.makeText(
                activity,
                R.string.download_open_failed,
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun resolveMimeType(result: FileDownloadResult): String {
        val serverMime = result.mimeType.substringBefore(';').trim()
        if (serverMime.isNotBlank() && serverMime != "application/octet-stream") {
            return serverMime
        }

        val extension = result.fileName.substringAfterLast('.', "")
            .lowercase(Locale.ROOT)
        return MimeTypeMap.getSingleton()
            .getMimeTypeFromExtension(extension)
            ?: "*/*"
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit

    override fun onActivityStarted(activity: Activity) = Unit

    override fun onActivityResumed(activity: Activity) {
        resumedActivity = WeakReference(activity)
        openIfPossible()
    }

    override fun onActivityPaused(activity: Activity) {
        if (resumedActivity?.get() === activity) {
            resumedActivity = null
        }
    }

    override fun onActivityStopped(activity: Activity) = Unit

    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit

    override fun onActivityDestroyed(activity: Activity) {
        if (resumedActivity?.get() === activity) {
            resumedActivity = null
        }
    }
}
