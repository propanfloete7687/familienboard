package de.burgold.familienboard;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * Zeigt das Familienboard im Vollbild an.
 * - Bildschirm bleibt an, Status- und Navigationsleiste sind ausgeblendet
 * - Zurück-Taste ist wirkungslos (Kinder navigieren nicht versehentlich weg)
 * - Langes Drücken öffnet ein Menü (neu laden, Einstellungen, Startbildschirm-App)
 * - Ohne Internet: Hinweis und automatischer neuer Versuch
 */
public class MainActivity extends Activity {

    private static final long RETRY_MS = 30_000;            // neuer Versuch bei Fehler
    private static final long FULL_RELOAD_MS = 6 * 3_600_000; // alle 6 Std. komplett neu laden

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView web;
    private TextView errorView;
    private boolean mainFrameFailed;

    private final Runnable retry = () -> {
        if (web != null) web.loadUrl(BuildConfig.BOARD_URL);
    };

    private final Runnable periodicReload = new Runnable() {
        @Override public void run() {
            if (web != null) web.reload();
            handler.postDelayed(this, FULL_RELOAD_MS);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
        }
        if (Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0F1115"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0F1115"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // Board-Schlüssel wird im localStorage gespeichert
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setUserAgentString(s.getUserAgentString() + " FamilienboardApp/" + BuildConfig.VERSION_NAME);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                // Alles außerhalb des Boards im Browser öffnen (falls mal ein Link auftaucht)
                if (!url.toString().startsWith(BuildConfig.BOARD_URL)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) {}
                    return true;
                }
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                mainFrameFailed = false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!mainFrameFailed) errorView.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    mainFrameFailed = true;
                    errorView.setVisibility(View.VISIBLE);
                    handler.removeCallbacks(retry);
                    handler.postDelayed(retry, RETRY_MS);
                }
            }
        });

        web.setLongClickable(true);
        web.setOnLongClickListener(v -> { showMenu(); return true; });

        errorView = new TextView(this);
        errorView.setText("Keine Verbindung zum Familienboard.\nNeuer Versuch in Kürze …\n\n(Lange drücken für Menü)");
        errorView.setTextColor(Color.parseColor("#8B919E"));
        errorView.setTextSize(20);
        errorView.setGravity(Gravity.CENTER);
        errorView.setBackgroundColor(Color.parseColor("#0F1115"));
        errorView.setVisibility(View.GONE);
        errorView.setOnLongClickListener(v -> { showMenu(); return true; });

        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        root.addView(errorView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(BuildConfig.BOARD_URL);
        }
        handler.postDelayed(periodicReload, FULL_RELOAD_MS);
    }

    private void showMenu() {
        String[] items = {
                "Board neu laden",
                "Startbildschirm-App wählen",
                "Android-Einstellungen öffnen",
                "Board schließen"
        };
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Familienboard " + BuildConfig.VERSION_NAME)
                .setItems(items, (d, which) -> {
                    switch (which) {
                        case 0: web.clearCache(false); web.loadUrl(BuildConfig.BOARD_URL); break;
                        case 1: openSettings(Settings.ACTION_HOME_SETTINGS); break;
                        case 2: openSettings(Settings.ACTION_SETTINGS); break;
                        case 3: finishAndRemoveTask(); break;
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    private void openSettings(String action) {
        try {
            startActivity(new Intent(action));
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemBars();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Absichtlich nichts tun – das Board soll offen bleiben.
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
