package com.syj5385.fileexplore

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.webkit.URLUtil
import android.widget.Toast
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.Executors
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.X509TrustManager

internal data class FileDownloadRequest(
    val url: String,
    val userAgent: String?,
    val contentDisposition: String?,
    val mimeType: String?,
    val cookie: String?,
    val trustedHost: String?,
    val trustedCertificateDer: ByteArray?
)

internal object FileDownloader {

    private const val MAX_REDIRECTS = 5
    private const val CONNECT_TIMEOUT_MS = 30_000
    private const val READ_TIMEOUT_MS = 120_000
    private const val BUFFER_SIZE = 64 * 1024

    private val executor = Executors.newFixedThreadPool(2)
    private val mainHandler = Handler(Looper.getMainLooper())

    fun enqueue(context: Context, request: FileDownloadRequest) {
        val appContext = context.applicationContext
        toast(appContext, appContext.getString(R.string.download_queued), Toast.LENGTH_SHORT)

        executor.execute {
            try {
                val fileName = download(appContext, request)
                toast(
                    appContext,
                    appContext.getString(R.string.download_complete, fileName),
                    Toast.LENGTH_LONG
                )
            } catch (_: SSLHandshakeException) {
                toast(appContext, appContext.getString(R.string.download_tls_failed), Toast.LENGTH_LONG)
            } catch (error: DownloadFailure) {
                toast(appContext, error.message ?: appContext.getString(R.string.download_failed), Toast.LENGTH_LONG)
            } catch (_: Exception) {
                toast(appContext, appContext.getString(R.string.download_io_failed), Toast.LENGTH_LONG)
            }
        }
    }

    private fun download(context: Context, request: FileDownloadRequest): String {
        var currentUrl = URL(request.url)
        val originalHost = currentUrl.host
        var redirectCount = 0

        while (true) {
            val connection = openConnection(currentUrl, request, originalHost)
            try {
                val status = connection.responseCode
                if (status in 300..399) {
                    if (redirectCount++ >= MAX_REDIRECTS) {
                        throw DownloadFailure(context.getString(R.string.download_too_many_redirects))
                    }

                    val location = connection.getHeaderField("Location")
                        ?: throw DownloadFailure(context.getString(R.string.download_invalid_redirect))
                    val nextUrl = URL(currentUrl, location)
                    if (nextUrl.path == "/login" || nextUrl.path.startsWith("/login/")) {
                        throw DownloadFailure(context.getString(R.string.download_auth_failed))
                    }
                    if (nextUrl.protocol != "http" && nextUrl.protocol != "https") {
                        throw DownloadFailure(context.getString(R.string.download_invalid_redirect))
                    }
                    currentUrl = nextUrl
                    continue
                }

                if (status == HttpURLConnection.HTTP_UNAUTHORIZED ||
                    status == HttpURLConnection.HTTP_FORBIDDEN
                ) {
                    throw DownloadFailure(context.getString(R.string.download_auth_failed))
                }
                if (status !in 200..299) {
                    throw DownloadFailure(
                        context.getString(R.string.download_http_failed, status)
                    )
                }
                if (currentUrl.path == "/login" || currentUrl.path.startsWith("/login/")) {
                    throw DownloadFailure(context.getString(R.string.download_auth_failed))
                }

                val responseMimeType = connection.contentType
                    ?.substringBefore(';')
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                    ?: request.mimeType
                    ?: "application/octet-stream"
                val responseDisposition = connection.getHeaderField("Content-Disposition")
                    ?: request.contentDisposition
                val guessedName = URLUtil.guessFileName(
                    currentUrl.toString(),
                    responseDisposition,
                    responseMimeType
                )
                val fileName = sanitizeFileName(guessedName)

                connection.inputStream.use { input ->
                    saveToDownloads(context, fileName, responseMimeType) { output ->
                        input.copyTo(output, BUFFER_SIZE)
                    }
                }
                return fileName
            } finally {
                connection.disconnect()
            }
        }
    }

    private fun openConnection(
        url: URL,
        request: FileDownloadRequest,
        originalHost: String
    ): HttpURLConnection {
        val connection = url.openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = false
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        connection.useCaches = false
        connection.setRequestProperty("Accept-Encoding", "identity")
        request.userAgent
            ?.takeIf { it.isNotBlank() }
            ?.let { connection.setRequestProperty("User-Agent", it) }
        if (url.host.equals(originalHost, ignoreCase = true)) {
            request.cookie
                ?.takeIf { it.isNotBlank() }
                ?.let { connection.setRequestProperty("Cookie", it) }
        }

        if (connection is HttpsURLConnection) {
            configurePinnedTls(connection, url, request)
        }
        return connection
    }

    private fun configurePinnedTls(
        connection: HttpsURLConnection,
        url: URL,
        request: FileDownloadRequest
    ) {
        val trustedHost = request.trustedHost ?: return
        val certificateDer = request.trustedCertificateDer ?: return
        if (!url.host.equals(trustedHost, ignoreCase = true)) return

        val pinnedCertificate = CertificateFactory.getInstance("X.509")
            .generateCertificate(certificateDer.inputStream()) as X509Certificate
        val pinnedEncoded = pinnedCertificate.encoded

        val trustManager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                throw CertificateException("Client certificates are not accepted")
            }

            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                val leaf = chain?.firstOrNull()
                    ?: throw CertificateException("Server certificate is missing")
                if (!MessageDigest.isEqual(leaf.encoded, pinnedEncoded)) {
                    throw CertificateException("Server certificate changed")
                }
            }

            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf(pinnedCertificate)
        }

        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, arrayOf(trustManager), SecureRandom())
        connection.sslSocketFactory = sslContext.socketFactory
        connection.hostnameVerifier = HostnameVerifier { hostname, _ ->
            hostname.equals(trustedHost, ignoreCase = true)
        }
    }

    private fun saveToDownloads(
        context: Context,
        fileName: String,
        mimeType: String,
        write: (java.io.OutputStream) -> Unit
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                put(MediaStore.Downloads.MIME_TYPE, mimeType)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IOException("Unable to create a Downloads entry")
            try {
                resolver.openOutputStream(uri, "w")?.use(write)
                    ?: throw IOException("Unable to open the Downloads entry")
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } catch (error: Exception) {
                resolver.delete(uri, null, null)
                throw error
            }
            return
        }

        @Suppress("DEPRECATION")
        val downloadsDirectory = Environment.getExternalStoragePublicDirectory(
            Environment.DIRECTORY_DOWNLOADS
        )
        if (!downloadsDirectory.exists() && !downloadsDirectory.mkdirs()) {
            throw IOException("Unable to create the Downloads directory")
        }
        val target = uniqueFile(downloadsDirectory, fileName)
        try {
            FileOutputStream(target).use(write)
        } catch (error: Exception) {
            target.delete()
            throw error
        }
    }

    private fun uniqueFile(directory: File, fileName: String): File {
        val direct = File(directory, fileName)
        if (!direct.exists()) return direct

        val dot = fileName.lastIndexOf('.')
        val base = if (dot > 0) fileName.substring(0, dot) else fileName
        val extension = if (dot > 0) fileName.substring(dot) else ""
        var suffix = 1
        while (true) {
            val candidate = File(directory, "$base ($suffix)$extension")
            if (!candidate.exists()) return candidate
            suffix += 1
        }
    }

    private fun sanitizeFileName(value: String): String {
        val leaf = value.substringAfterLast('/').substringAfterLast('\\')
        val cleaned = leaf
            .replace(Regex("[\\u0000-\\u001F\\u007F]"), "_")
            .trim()
            .take(180)
        return cleaned.ifBlank { "download" }
    }

    private fun toast(context: Context, message: String, duration: Int) {
        mainHandler.post {
            Toast.makeText(context, message, duration).show()
        }
    }

    private class DownloadFailure(message: String) : IOException(message)
}
