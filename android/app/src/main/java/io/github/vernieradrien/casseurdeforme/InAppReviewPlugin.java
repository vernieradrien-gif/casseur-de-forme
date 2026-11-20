package io.github.vernieradrien.casseurdeforme;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * Fenêtre d'avis Google Play intégrée au jeu (In-App Review).
 * Google choisit seul de l'afficher ou non (quota) ; la promesse se résout dans tous les cas.
 * Pendant la fenêtre, l'activité passe en pause : le jeu se met en pause comme pour un retour au bureau.
 */
@CapacitorPlugin(name = "InAppReview")
public class InAppReviewPlugin extends Plugin {

    @PluginMethod
    public void requestReview(PluginCall call) {
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener(request -> {
            if (!request.isSuccessful() || getActivity() == null) {
                call.resolve();
                return;
            }
            ReviewInfo info = request.getResult();
            manager.launchReviewFlow(getActivity(), info).addOnCompleteListener(done -> call.resolve());
        });
    }
}
