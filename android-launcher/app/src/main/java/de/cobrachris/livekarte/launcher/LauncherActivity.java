package de.cobrachris.livekarte.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

public final class LauncherActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        openLivekarte();
    }

    private void openLivekarte() {
        // Never consume an external URL or use an isolated WebView profile.
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(LaunchTarget.URL));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setPackage(LaunchTarget.BROWSER_PACKAGE);
        try {
            startActivity(intent);
            finish();
        } catch (ActivityNotFoundException | SecurityException unavailable) {
            new AlertDialog.Builder(this)
                .setTitle(R.string.browser_missing_title)
                .setMessage(R.string.browser_missing_message)
                .setPositiveButton(R.string.retry, (dialog, which) -> openLivekarte())
                .setNeutralButton(R.string.copy_link, (dialog, which) -> {
                    ClipboardManager clipboard = getSystemService(ClipboardManager.class);
                    if (clipboard != null) {
                        clipboard.setPrimaryClip(ClipData.newPlainText(getString(R.string.app_name), LaunchTarget.URL));
                    }
                    finish();
                })
                .setNegativeButton(android.R.string.cancel, (dialog, which) -> finish())
                .setOnCancelListener(dialog -> finish())
                .show();
        }
    }
}
