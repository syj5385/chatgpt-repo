package com.syj5385.fileexplore;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Environment;
import android.view.LayoutInflater;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.net.URISyntaxException;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String PREFS_NAME = "file_explore_preferences";
    private static final String PREF_SERVER_URL = "server_url";
    private static final int FILE_CHOOSER_REQUEST = 1001;

    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout errorPanel;
    private TextView errorTitle;
    private TextView errorMessage;
    private TextView serverStatus;
    private SharedPreferences preferences;
    private ValueCallback<Uri[]> pendingFileCallback;
    private Uri configuredServer;
    private String temporarilyTrustedSslHost;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        errorPanel = findViewById(R.id.errorPanel);
        errorTitle = findViewById(R.id.errorTitle);
        errorMessage = findViewById(R.id.errorMessage);
        serverStatus = findViewById(R.id.serverStatus);

        configureWebView();

        findViewById(R.id.reloadButton).setOnClickListener(view -> reloadServer());
        findViewById(R.id.settingsButton).setOnClickListener(view -> showServerSettings(false));
        findViewById(R.id.retryButton).setOnClickListener(view -> reloadServer());

        String savedUrl = preferences.getString(PREF_SERVER_URL, "");
        configuredServer = parseServerUri(savedUrl);
        updateServerStatus();

        if (savedInstanceState != null && configuredServer != null) {
            webView.restoreState(savedInstanceState);
        } else if (configuredServer != null) {
            webView.loadUrl(configuredServer.toString());
        } else {
            showServerSettings(true);
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSafeBrowsingEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString() + " FileExploreAndroid/1.0");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, false);

        webView.setWebViewClient(new FileExploreWebViewClient());
        webView.setWebChromeClient(new FileExploreChromeClient());
        webView.setDownloadListener(createDownloadListener());
    }

    private DownloadListener createDownloadListener() {
        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle(fileName);
                request.setDescription("FileExplore에서 다운로드 중");
                request.setMimeType(mimeType);
                request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                );
                request.setAllowedOverMetered(true);
                request.setAllowedOverRoaming(false);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null && !cookies.trim().isEmpty()) {
                    request.addRequestHeader("Cookie", cookies);
                }
                if (userAgent != null && !userAgent.trim().isEmpty()) {
                    request.addRequestHeader("User-Agent", userAgent);
                }

                DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                manager.enqueue(request);
                Toast.makeText(this, "다운로드를 시작했습니다: " + fileName, Toast.LENGTH_LONG).show();

                Uri downloadUri = Uri.parse(url);
                if (temporarilyTrustedSslHost != null
                        && temporarilyTrustedSslHost.equalsIgnoreCase(downloadUri.getHost())) {
                    Toast.makeText(
                            this,
                            "참고: Android 다운로드 관리자는 자체 서명 인증서를 거부할 수 있습니다.",
                            Toast.LENGTH_LONG
                    ).show();
                }
            } catch (Exception exception) {
                Toast.makeText(this, "다운로드를 시작하지 못했습니다.", Toast.LENGTH_LONG).show();
            }
        };
    }

    private void reloadServer() {
        hideError();
        if (configuredServer == null) {
            showServerSettings(true);
            return;
        }
        if (webView.getUrl() == null) {
            webView.loadUrl(configuredServer.toString());
        } else {
            webView.reload();
        }
    }

    private void showServerSettings(boolean required) {
        View content = LayoutInflater.from(this).inflate(R.layout.dialog_server_settings, null, false);
        EditText input = content.findViewById(R.id.serverUrlInput);
        String current = configuredServer == null ? "" : configuredServer.toString();
        input.setText(current);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("FileServer 주소")
                .setView(content)
                .setPositiveButton("저장", null)
                .setNegativeButton(required ? null : "취소", null)
                .create();
        dialog.setCancelable(!required);
        dialog.setCanceledOnTouchOutside(!required);
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(button -> {
                    Uri parsed = parseServerUri(input.getText().toString());
                    if (parsed == null) {
                        input.setError("http:// 또는 https:// 주소를 입력하세요.");
                        return;
                    }
                    configuredServer = parsed;
                    temporarilyTrustedSslHost = null;
                    preferences.edit().putString(PREF_SERVER_URL, parsed.toString()).apply();
                    updateServerStatus();
                    hideError();
                    webView.clearHistory();
                    webView.loadUrl(parsed.toString());
                    dialog.dismiss();
                }));
        dialog.show();
    }

    private Uri parseServerUri(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.isEmpty()) {
            return null;
        }
        if (!normalized.contains("://")) {
            normalized = "https://" + normalized;
        }
        Uri uri = Uri.parse(normalized);
        String scheme = uri.getScheme();
        if (uri.getHost() == null
                || scheme == null
                || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            return null;
        }
        String text = uri.toString();
        while (text.endsWith("/") && text.length() > scheme.length() + 3) {
            text = text.substring(0, text.length() - 1);
        }
        return Uri.parse(text);
    }

    private void updateServerStatus() {
        if (configuredServer == null) {
            serverStatus.setText(R.string.server_not_configured);
            return;
        }
        String host = configuredServer.getHost();
        int port = configuredServer.getPort();
        serverStatus.setText(port > 0 ? host + ":" + port : host);
    }

    private boolean belongsToConfiguredServer(Uri uri) {
        return configuredServer != null
                && uri != null
                && configuredServer.getHost() != null
                && configuredServer.getHost().equalsIgnoreCase(uri.getHost());
    }

    private boolean openExternally(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException exception) {
            Toast.makeText(this, "이 링크를 열 수 있는 앱이 없습니다.", Toast.LENGTH_LONG).show();
            return true;
        }
    }

    private void showError(String title, String message) {
        progressBar.setVisibility(View.GONE);
        errorTitle.setText(title);
        errorMessage.setText(message);
        errorPanel.setVisibility(View.VISIBLE);
    }

    private void hideError() {
        errorPanel.setVisibility(View.GONE);
    }

    private String describeSslError(SslError error) {
        return switch (error.getPrimaryError()) {
            case SslError.SSL_EXPIRED -> "인증서가 만료되었습니다.";
            case SslError.SSL_IDMISMATCH -> "인증서의 호스트 이름이 서버 주소와 다릅니다.";
            case SslError.SSL_NOTYETVALID -> "인증서의 유효 기간이 아직 시작되지 않았습니다.";
            case SslError.SSL_UNTRUSTED -> "신뢰할 수 없는 인증기관이 발급한 인증서입니다.";
            case SslError.SSL_DATE_INVALID -> "인증서 날짜가 올바르지 않습니다.";
            case SslError.SSL_INVALID -> "인증서가 유효하지 않습니다.";
            default -> "인증서를 확인할 수 없습니다.";
        };
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || pendingFileCallback == null) {
            return;
        }
        Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        pendingFileCallback.onReceiveValue(result);
        pendingFileCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = null;
        }
        webView.stopLoading();
        webView.setWebChromeClient(null);
        webView.setWebViewClient(null);
        webView.destroy();
        super.onDestroy();
    }

    private final class FileExploreChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progressBar.setProgress(newProgress);
            progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
        }

        @Override
        public boolean onShowFileChooser(
                WebView webView,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams
        ) {
            if (pendingFileCallback != null) {
                pendingFileCallback.onReceiveValue(null);
            }
            pendingFileCallback = filePathCallback;
            try {
                Intent chooserIntent = fileChooserParams.createIntent();
                startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST);
                return true;
            } catch (ActivityNotFoundException exception) {
                pendingFileCallback = null;
                Toast.makeText(MainActivity.this, "파일 선택기를 열 수 없습니다.", Toast.LENGTH_LONG).show();
                return false;
            }
        }
    }

    private final class FileExploreWebViewClient extends WebViewClient {
        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            hideError();
            progressBar.setVisibility(View.VISIBLE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progressBar.setVisibility(View.GONE);
            CookieManager.getInstance().flush();
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (scheme.equals("http") || scheme.equals("https")) {
                return belongsToConfiguredServer(uri) ? false : openExternally(uri);
            }
            if (scheme.equals("blob") || scheme.equals("data") || scheme.equals("about")) {
                return false;
            }
            if (scheme.equals("intent")) {
                try {
                    Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                    startActivity(intent);
                    return true;
                } catch (URISyntaxException | ActivityNotFoundException exception) {
                    return true;
                }
            }
            return openExternally(uri);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) {
                return;
            }
            String detail = error.getDescription() == null
                    ? "서버와 통신할 수 없습니다."
                    : error.getDescription().toString();
            showError(
                    "FileServer에 연결할 수 없습니다",
                    detail + "\n\n같은 Wi-Fi인지, 서버 주소와 포트가 맞는지 확인하세요."
            );
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            Uri failingUri = Uri.parse(error.getUrl());
            String host = failingUri.getHost();
            if (host != null && host.equalsIgnoreCase(temporarilyTrustedSslHost)) {
                handler.proceed();
                return;
            }

            handler.cancel();
            String reason = describeSslError(error);
            new AlertDialog.Builder(MainActivity.this)
                    .setTitle("안전하지 않은 인증서")
                    .setMessage(
                            reason
                                    + "\n\n서버: " + error.getUrl()
                                    + "\n\n내부망의 직접 만든 FileServer가 맞는지 확인한 경우에만 계속하세요. "
                                    + "이 허용은 앱을 종료할 때까지만 유지됩니다."
                    )
                    .setNegativeButton("취소", (dialog, which) -> showError(
                            "인증서 오류",
                            reason + "\n\n신뢰되는 인증서를 설치하거나 서버 설정을 확인하세요."
                    ))
                    .setPositiveButton("이번 실행에서 계속", (dialog, which) -> {
                        temporarilyTrustedSslHost = host;
                        webView.reload();
                    })
                    .show();
        }
    }
}
