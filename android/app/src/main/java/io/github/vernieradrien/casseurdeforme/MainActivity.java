package io.github.vernieradrien.casseurdeforme;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Activité principale : le jeu web (Capacitor) en plein écran.
 * Les barres système sont masquées ; un glissement depuis le bord les fait réapparaître un instant.
 * Le bouton retour est géré par le jeu (plugin @capacitor/app).
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Sauvegarde Google Play Jeux (plugin maison, déclaré avant le démarrage du pont Capacitor).
        registerPlugin(CloudSavePlugin.class);
        super.onCreate(savedInstanceState);
        CloudSavePlugin.initIfConfigured(this);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
