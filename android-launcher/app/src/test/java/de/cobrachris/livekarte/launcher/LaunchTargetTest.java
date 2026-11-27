package de.cobrachris.livekarte.launcher;
import org.junit.Test;
import static org.junit.Assert.*;
import java.net.URI;

public class LaunchTargetTest {
    @Test public void onlyExistingOriginAndPath() {
        URI target = URI.create(LaunchTarget.URL);
        assertEquals("https", target.getScheme());
        assertEquals("cobrachris.github.io", target.getHost());
        assertEquals("/meine-livekarte/", target.getPath());
        assertNull(target.getQuery());
        assertNull(target.getFragment());
        assertNull(target.getUserInfo());
        assertEquals("com.android.chrome", LaunchTarget.BROWSER_PACKAGE);
    }
}
