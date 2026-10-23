package io.github.vernieradrien.casseurdeforme;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;
import java.nio.charset.StandardCharsets;

/**
 * Sauvegarde dans le cloud avec le compte Google du joueur (Google Play Jeux, « Saved Games »).
 * Ne fonctionne qu'une fois le jeu configuré dans la Play Console (identifiant game_services_project_id,
 * voir docs/publication.md) ; sinon isAvailable() renvoie false et rien n'est initialisé.
 */
@CapacitorPlugin(name = "CloudSave")
public class CloudSavePlugin extends Plugin {

    private static final String SNAPSHOT = "casseur-de-forme";
    private static boolean initialized = false;

    /** Identifiant du projet Play Jeux renseigné dans strings.xml (vide tant que non configuré). */
    static boolean isConfigured(Context context) {
        String id = context.getString(R.string.game_services_project_id);
        return id != null && id.matches("\\d{6,}");
    }

    static void initIfConfigured(Context context) {
        if (!initialized && isConfigured(context)) {
            PlayGamesSdk.initialize(context);
            initialized = true;
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", isConfigured(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void status(PluginCall call) {
        if (!isConfigured(getContext())) {
            JSObject ret = new JSObject();
            ret.put("signedIn", false);
            call.resolve(ret);
            return;
        }
        initIfConfigured(getContext());
        PlayGames.getGamesSignInClient(getActivity()).isAuthenticated().addOnCompleteListener(task -> {
            JSObject ret = new JSObject();
            ret.put("signedIn", task.isSuccessful() && task.getResult().isAuthenticated());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        if (!isConfigured(getContext())) {
            call.reject("not-configured");
            return;
        }
        initIfConfigured(getContext());
        PlayGames.getGamesSignInClient(getActivity()).signIn().addOnCompleteListener(task -> {
            JSObject ret = new JSObject();
            ret.put("signedIn", task.isSuccessful() && task.getResult().isAuthenticated());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        String description = call.getString("description", "Prisma Blast");
        if (data == null || !isConfigured(getContext())) {
            call.reject("not-configured");
            return;
        }
        initIfConfigured(getContext());
        SnapshotsClient client = PlayGames.getSnapshotsClient(getActivity());
        client.open(SNAPSHOT, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED).addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult().isConflict() || task.getResult().getData() == null) {
                call.reject("open-failed");
                return;
            }
            Snapshot snapshot = task.getResult().getData();
            snapshot.getSnapshotContents().writeBytes(data.getBytes(StandardCharsets.UTF_8));
            SnapshotMetadataChange change = new SnapshotMetadataChange.Builder().setDescription(description).build();
            client.commitAndClose(snapshot, change).addOnCompleteListener(done -> {
                if (done.isSuccessful()) call.resolve();
                else call.reject("commit-failed");
            });
        });
    }

    @PluginMethod
    public void load(PluginCall call) {
        if (!isConfigured(getContext())) {
            call.reject("not-configured");
            return;
        }
        initIfConfigured(getContext());
        SnapshotsClient client = PlayGames.getSnapshotsClient(getActivity());
        client.open(SNAPSHOT, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED).addOnCompleteListener(task -> {
            JSObject ret = new JSObject();
            if (!task.isSuccessful() || task.getResult().isConflict() || task.getResult().getData() == null) {
                call.reject("open-failed");
                return;
            }
            Snapshot snapshot = task.getResult().getData();
            try {
                byte[] bytes = snapshot.getSnapshotContents().readFully();
                ret.put("data", bytes == null || bytes.length == 0 ? null : new String(bytes, StandardCharsets.UTF_8));
            } catch (Exception e) {
                ret.put("data", null);
            }
            client.discardAndClose(snapshot);
            call.resolve(ret);
        });
    }
}
