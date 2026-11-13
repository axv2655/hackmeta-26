import { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";

import { StackScreen } from "@/components/common/StackScreen";
import { SettingsScroll } from "@/components/settings/SettingsPage";
import { SettingsGroup } from "@/components/settings/SettingsRow";
import { Button } from "@/components/ui/Button";
import { errorMessage } from "@/lib/backend";
import { endpoints } from "@/lib/endpoints";
import {
  MCP_URL,
  connectPrompt,
  copyText,
  isPublicUrl,
  openMuse,
} from "@/lib/museConnect";
import { useSession } from "@/lib/session";
import { colors, radius, spacing, type as typeScale } from "@/lib/theme";
import { toast } from "@/lib/toast";

/**
 * Connect Muse (Meta AI) to Moves: mint this user's one `/mcp` token, then
 * copy a prompt with the connector URL and token to paste into Muse. The
 * token lives only in this screen's state and is never saved on the phone.
 */

function MintForm({ onMinted }: { onMinted: (token: string) => void }) {
  const username = useSession((s) => s.account?.username ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mint = async () => {
    setBusy(true);
    setError(null);
    try {
      const issued = await endpoints.mcpTokens.mint(username, password);
      setPassword("");
      onMinted(issued.token);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsGroup
      title="Your Muse token"
      footer="Making a new token turns off your old one. Anyone with it can post Moves as you, so keep it private."
    >
      <View style={styles.form}>
        <Text style={styles.label}>
          Confirm your password{username ? ` for @${username}` : ""}
        </Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.placeholder}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => password && void mint()}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          title={busy ? "Making token" : "Make my token"}
          icon="lock"
          disabled={busy || !password || !username}
          onPress={() => void mint()}
        />
      </View>
    </SettingsGroup>
  );
}

function PromptCard({ token }: { token: string }) {
  const prompt = connectPrompt(token);
  const copy = async () => {
    try {
      const how = await copyText(prompt);
      if (how === "copied") toast("Prompt copied. Paste it into Muse.");
    } catch {
      toast("Couldn't copy. Select the text and copy it.");
    }
  };
  return (
    <SettingsGroup
      title="Paste this into Muse"
      footer="This token is shown once. Copy it now."
    >
      <View style={styles.form}>
        <Text style={styles.prompt} selectable>
          {prompt}
        </Text>
        <Button title="Copy prompt" icon="copy" onPress={() => void copy()} />
        <Button
          title="Open Muse"
          icon="external"
          variant="secondary"
          onPress={() =>
            void openMuse().catch(() => toast("Couldn't open Muse"))
          }
        />
      </View>
    </SettingsGroup>
  );
}

export default function ConnectMuseScreen() {
  const [token, setToken] = useState<string | null>(null);
  const reachable = isPublicUrl(MCP_URL);
  return (
    <StackScreen title="Connect Muse">
      <SettingsScroll>
        <View style={styles.intro}>
          <Text style={styles.title}>Use Moves from Muse</Text>
          <Text style={styles.body}>
            Muse (Meta AI) can post Moves and pull up for you, even from your
            glasses. Make your token, copy the prompt, and paste it into Muse.
            Muse always reads you a draft before posting.
          </Text>
          <Text style={styles.url} selectable>
            Connector: {MCP_URL}
          </Text>
          {reachable ? null : (
            <Text style={styles.warn}>
              Muse can't reach this address. Set EXPO_PUBLIC_MCP_URL to the
              public https URL of /mcp.
            </Text>
          )}
        </View>
        {token ? <PromptCard token={token} /> : null}
        <MintForm onMinted={setToken} />
      </SettingsScroll>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  title: { ...typeScale.screenTitle },
  body: { ...typeScale.body },
  url: { ...typeScale.rowSub },
  warn: { ...typeScale.rowSub, color: colors.badgeRed },
  form: { padding: spacing.lg, gap: spacing.md },
  label: { ...typeScale.rowSub },
  // Same field as the login screen.
  input: {
    height: 56,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.lg,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.white,
  },
  error: { ...typeScale.rowSub, color: colors.badgeRed },
  prompt: {
    ...typeScale.rowSub,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
  },
});
