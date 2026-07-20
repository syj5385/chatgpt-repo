package com.syj5385.fileexplore

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslCertificate
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.HttpAuthHandler
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {

    companion object {
        private const val PREFS_NAME = "file_explore_preferences"
        private const val PREF_SERVER_URL = "server_url"
        private const val FILE_CHOOSER_REQUEST = 1001
        private const val DOWNLOAD_PERMISSION_REQUEST = 1002
    }

    private lateinit var webView: WebView
    private lateinit var pageProgress: ProgressBar
    private lateinit var pageTitle: TextView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingDownload: FileDownloadRequest? = null
    private var homeUrl: String? = null
    private var acceptedSslHost: String? = null
    private var acceptedSslCertificateDer: ByteArray? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        pageProgress = findViewById(R.id.pageProgress)
        pageTitle = findViewById(R.id.pageTitle)

        applySystemBarInsets()
        configureWebView()

        findViewById<Button>(R.id.reloadButton).setOnClickListener {
            if (webView.url.isNullOrBlank()) {
                homeUrl?.let(webView::loadUrl)
            } else {
                webView.reload()
            }
        }

        findViewById<Button>(R.id.serverButton).setOnClickListener {
            showServerDialog(required = false)
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
            homeUrl = preferences().getString(PREF_SERVER_URL, null)
            updateTitle(webView.url ?: homeUrl)
        } else {
            val savedUrl = preferences().getString(PREF_SERVER_URL, null)
            if (savedUrl.isNullOrBlank()) {
                showServerDialog(required = true)
            } else {
                loadServer(savedUrl)
            }
        }
    }

    private fun configureWebView() {
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        val isDebuggable =
            (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        WebView.setWebContentsDebuggingEnabled(isDebuggable)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadsImagesAutomatically = true
            useWideViewPort = true
            loadWithOverviewMode = true
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = true
            allowFileAccess = false
            allowContentAccess = true
            setSupportMultipleWindows(false)
            userAgentString = "$userAgentString FileExploreAndroid/1.0.3"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                safeBrowsingEnabled = true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                pageProgress.visibility = View.VISIBLE
                updateTitle(url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                pageProgress.visibility = View.GONE
                CookieManager.getInstance().flush()
                updateTitle(view?.title ?: url)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean = handleNavigation(request?.url)

            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return handleNavigation(url?.let(Uri::parse))
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    pageProgress.visibility = View.GONE
                    val message = error?.description?.toString().orEmpty()
                    if (message.isNotBlank()) {
                        Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
                    }
                }
            }

            override fun onReceivedSslError(
                view: WebView?,
                handler: SslErrorHandler?,
                error: SslError?
            ) {
                if (handler == null) return
                if (isFinishing || isDestroyed) {
                    handler.cancel()
                    return
                }

                val host = error?.url?.let { Uri.parse(it).host }.orEmpty()
                val certificateDer = sslCertificateDer(error?.certificate)
                val alreadyAccepted = host.equals(acceptedSslHost, ignoreCase = true) &&
                    certificateDer != null &&
                    acceptedSslCertificateDer?.contentEquals(certificateDer) == true
                if (alreadyAccepted) {
                    handler.proceed()
                    return
                }

                val reason = sslErrorDescription(error)
                AlertDialog.Builder(this@MainActivity)
                    .setTitle(R.string.ssl_warning_title)
                    .setMessage(
                        "$host\n$reason\n\n" +
                            "계속하면 이번 앱 실행 동안 이 서버와 동일한 인증서에만 접속과 다운로드를 허용합니다."
                    )
                    .setNegativeButton(R.string.ssl_warning_cancel) { _, _ -> handler.cancel() }
                    .setPositiveButton(R.string.ssl_warning_continue) { _, _ ->
                        acceptedSslHost = host
                        acceptedSslCertificateDer = certificateDer?.copyOf()
                        handler.proceed()
                    }
                    .setOnCancelListener { handler.cancel() }
                    .show()
            }

            override fun onReceivedHttpAuthRequest(
                view: WebView?,
                handler: HttpAuthHandler?,
                host: String?,
                realm: String?
            ) {
                if (handler == null) return
                showHttpAuthDialog(handler, host.orEmpty(), realm.orEmpty())
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                pageProgress.progress = newProgress
                pageProgress.visibility = if (newProgress in 0..99) View.VISIBLE else View.GONE
            }

            override fun onReceivedTitle(view: WebView?, title: String?) {
                updateTitle(title ?: view?.url)
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                val chooserIntent = try {
                    fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    }
                } catch (_: Exception) {
                    Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    }
                }

                return try {
                    startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST)
                    true
                } catch (_: ActivityNotFoundException) {
                    this@MainActivity.filePathCallback = null
                    Toast.makeText(
                        this@MainActivity,
                        R.string.file_chooser_failed,
                        Toast.LENGTH_LONG
                    ).show()
                    false
                }
            }
        }

        webView.setDownloadListener(DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            startDownload(url, userAgent, contentDisposition, mimeType)
        })
    }

    private fun loadServer(url: String) {
        val normalized = normalizeServerUrl(url) ?: return
        homeUrl = normalized
        preferences().edit().putString(PREF_SERVER_URL, normalized).apply()
        updateTitle(normalized)
        webView.loadUrl(normalized)
    }

    private fun showServerDialog(required: Boolean) {
        val input = EditText(this).apply {
            hint = getString(R.string.server_dialog_hint)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
            setText(homeUrl ?: preferences().getString(PREF_SERVER_URL, ""))
            setSelection(text.length)
        }

        val horizontalPadding = (20 * resources.displayMetrics.density).toInt()
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(horizontalPadding, 0, horizontalPadding, 0)
            addView(
                input,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
        }

        val dialog = AlertDialog.Builder(this)
            .setTitle(R.string.server_dialog_title)
            .setView(container)
            .setPositiveButton(R.string.connect, null)
            .apply {
                if (!required) {
                    setNegativeButton(R.string.cancel, null)
                }
            }
            .setCancelable(!required)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val normalized = normalizeServerUrl(input.text.toString())
                if (normalized == null) {
                    input.error = getString(R.string.invalid_server_url)
                    return@setOnClickListener
                }
                dialog.dismiss()
                acceptedSslHost = null
                acceptedSslCertificateDer = null
                webView.stopLoading()
                webView.clearHistory()
                loadServer(normalized)
            }
        }

        dialog.show()
        input.requestFocus()
    }

    private fun normalizeServerUrl(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null

        val withScheme = if (trimmed.startsWith("http://", ignoreCase = true) ||
            trimmed.startsWith("https://", ignoreCase = true)
        ) {
            trimmed
        } else {
            "https://$trimmed"
        }

        return try {
            val uri = Uri.parse(withScheme)
            if ((uri.scheme == "http" || uri.scheme == "https") && !uri.host.isNullOrBlank()) {
                withScheme.trimEnd('/')
            } else {
                null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun handleNavigation(uri: Uri?): Boolean {
        if (uri == null) return false
        return when (uri.scheme?.lowercase()) {
            "http", "https" -> false
            else -> {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                } catch (_: ActivityNotFoundException) {
                    Toast.makeText(this, R.string.open_external_failed, Toast.LENGTH_LONG).show()
                }
                true
            }
        }
    }

    private fun startDownload(
        url: String?,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?
    ) {
        if (url.isNullOrBlank() || url.startsWith("blob:", ignoreCase = true)) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_LONG).show()
            return
        }

        val download = FileDownloadRequest(
            url = url,
            userAgent = userAgent,
            contentDisposition = contentDisposition,
            mimeType = mimeType,
            cookie = CookieManager.getInstance().getCookie(url),
            trustedHost = acceptedSslHost,
            trustedCertificateDer = acceptedSslCertificateDer?.copyOf()
        )
        if (requiresLegacyStoragePermission() &&
            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            pendingDownload = download
            requestPermissions(
                arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE),
                DOWNLOAD_PERMISSION_REQUEST
            )
            return
        }

        enqueueDownload(download)
    }

    private fun requiresLegacyStoragePermission(): Boolean {
        return Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
    }

    private fun enqueueDownload(download: FileDownloadRequest) {
        FileDownloader.enqueue(applicationContext, download)
    }

    private fun sslCertificateDer(certificate: SslCertificate?): ByteArray? {
        if (certificate == null) return null
        return runCatching {
            val state = SslCertificate.saveState(certificate) ?: return null
            state.getByteArray("x509-certificate")?.copyOf()
        }.getOrNull()
    }

    private fun showHttpAuthDialog(handler: HttpAuthHandler, host: String, realm: String) {
        val username = EditText(this).apply {
            hint = getString(R.string.username)
            setSingleLine(true)
        }
        val password = EditText(this).apply {
            hint = getString(R.string.password)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine(true)
        }
        val padding = (20 * resources.displayMetrics.density).toInt()
        val fields = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, 0, padding, 0)
            addView(username)
            addView(password)
        }

        val details = listOf(host, realm).filter { it.isNotBlank() }.joinToString(" · ")
        AlertDialog.Builder(this)
            .setTitle(R.string.http_auth_title)
            .setMessage(details)
            .setView(fields)
            .setNegativeButton(R.string.cancel) { _, _ -> handler.cancel() }
            .setPositiveButton(R.string.login) { _, _ ->
                handler.proceed(username.text.toString(), password.text.toString())
            }
            .setOnCancelListener { handler.cancel() }
            .show()
    }

    private fun sslErrorDescription(error: SslError?): String {
        return when (error?.primaryError) {
            SslError.SSL_DATE_INVALID -> "인증서 날짜가 올바르지 않습니다."
            SslError.SSL_EXPIRED -> "인증서가 만료되었습니다."
            SslError.SSL_IDMISMATCH -> "서버 주소와 인증서 이름이 일치하지 않습니다."
            SslError.SSL_NOTYETVALID -> "인증서가 아직 유효하지 않습니다."
            SslError.SSL_UNTRUSTED -> "자체 서명되었거나 신뢰되지 않은 인증서입니다."
            else -> "TLS 인증서 검증에 실패했습니다."
        }
    }

    private fun updateTitle(value: String?) {
        val text = value.orEmpty().trim()
        if (text.isBlank()) {
            pageTitle.setText(R.string.app_name)
            return
        }

        val host = runCatching { Uri.parse(text).host }.getOrNull()
        pageTitle.text = host?.takeIf { it.isNotBlank() } ?: text
    }

    private fun preferences() = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun applySystemBarInsets() {
        val root = findViewById<View>(R.id.root)
        root.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            } else {
                @Suppress("DEPRECATION")
                view.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom
                )
            }
            insets
        }
        root.requestApplyInsets()
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_REQUEST) {
            val result = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            filePathCallback?.onReceiveValue(result)
            filePathCallback = null
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != DOWNLOAD_PERMISSION_REQUEST) return

        val download = pendingDownload
        pendingDownload = null
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED && download != null) {
            enqueueDownload(download)
        } else {
            Toast.makeText(this, R.string.download_permission_denied, Toast.LENGTH_LONG).show()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        pendingDownload = null
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        webView.stopLoading()
        webView.webChromeClient = null
        webView.webViewClient = WebViewClient()
        webView.destroy()
        super.onDestroy()
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
