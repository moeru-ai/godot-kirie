#ifndef KIRIE_PLUGIN_H
#define KIRIE_PLUGIN_H

#include "core/version.h"

#include "core/object/object.h"

class KiriePlugin : public Object {
	GDSOFTCLASS(KiriePlugin, Object);

	void *webview_ready_observer = nullptr;
	void *ipc_message_received_observer = nullptr;
	void *ipc_error_observer = nullptr;
	Callable webview_ready_callback;
	Callable ipc_message_received_callback;
	Callable ipc_error_callback;

public:
	static KiriePlugin *get_singleton();

	void registerCallbacks(Callable on_webview_ready, Callable on_ipc_message_received, Callable on_ipc_error);
	void createWebView(String initial_url);
	void destroyWebView();
	void loadUrl(String url);
	void sendIpcMessage(String message_json);

	virtual Variant callp(const StringName &p_method, const Variant **p_args, int p_argcount, Callable::CallError &r_error) override;

	KiriePlugin();
	~KiriePlugin();
};

#endif
