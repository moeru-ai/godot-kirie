#ifndef KIRIE_PLUGIN_H
#define KIRIE_PLUGIN_H

#include "core/version.h"

#include "core/object/object.h"

class KiriePlugin : public Object {
	GDCLASS(KiriePlugin, Object);

	void *webview_ready_observer = nullptr;
	void *ipc_message_received_observer = nullptr;
	void *text_received_observer = nullptr;
	void *binary_received_observer = nullptr;
	void *data_received_observer = nullptr;
	void *ipc_error_observer = nullptr;
	Callable webview_ready_callback;
	Callable ipc_message_received_callback;
	Callable text_received_callback;
	Callable binary_received_callback;
	Callable data_received_callback;
	Callable ipc_error_callback;

protected:
	static void _bind_methods();

public:
	static KiriePlugin *get_singleton();

	void registerCallbacks(Callable on_webview_ready, Callable on_text_received, Callable on_binary_received, Callable on_data_received, Callable on_ipc_error);
	void createWebView(String initial_url);
	void destroyWebView();
	void loadUrl(String url);
	void loadHtmlString(String html, String base_url);
	void sendIpcMessage(String message_json);
	void sendText(String message);
	void sendBinary(PackedByteArray bytes);
	void sendData(Variant value);
	String getLaunchOption(String key);

	virtual Variant callp(const StringName &p_method, const Variant **p_args, int p_argcount, Callable::CallError &r_error) override;

	KiriePlugin();
	~KiriePlugin();
};

#endif
