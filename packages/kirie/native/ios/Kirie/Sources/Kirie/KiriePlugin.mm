#include "KiriePlugin.h"

#import <Foundation/Foundation.h>

extern "C" void kirie_swift_create_webview(const char *initial_url);
extern "C" void kirie_swift_destroy_webview(void);
extern "C" void kirie_swift_load_url(const char *url);
extern "C" void kirie_swift_load_html_string(const char *html, const char *base_url);
extern "C" void kirie_swift_send_ipc_message(const char *message_json);

static NSString *const KirieWebViewReadyNotification = @"KirieWebViewReady";
static NSString *const KirieIpcMessageReceivedNotification = @"KirieIpcMessageReceived";
static NSString *const KirieIpcErrorNotification = @"KirieIpcError";

static KiriePlugin *singleton = nullptr;

static String to_godot_string(id value) {
	if (![value isKindOfClass:[NSString class]]) {
		return String();
	}

	return String::utf8([(NSString *)value UTF8String]);
}

static bool require_arg_count(Callable::CallError &r_error, int p_argcount, int p_expected) {
	if (p_argcount == p_expected) {
		return true;
	}

	r_error.error = p_argcount < p_expected ? Callable::CallError::CALL_ERROR_TOO_FEW_ARGUMENTS : Callable::CallError::CALL_ERROR_TOO_MANY_ARGUMENTS;
	r_error.expected = p_expected;
	return false;
}

static void call_callback(const Callable &callback) {
	if (callback.is_null()) {
		return;
	}

	Variant return_value;
	Callable::CallError call_error;
	callback.callp(nullptr, 0, return_value, call_error);
}

static void call_callback(const Callable &callback, const String &value) {
	if (callback.is_null()) {
		return;
	}

	Variant argument = value;
	const Variant *arguments[] = { &argument };
	Variant return_value;
	Callable::CallError call_error;
	callback.callp(arguments, 1, return_value, call_error);
}

void KiriePlugin::registerCallbacks(Callable on_webview_ready, Callable on_ipc_message_received, Callable on_ipc_error) {
	webview_ready_callback = on_webview_ready;
	ipc_message_received_callback = on_ipc_message_received;
	ipc_error_callback = on_ipc_error;
}

void KiriePlugin::createWebView(String initial_url) {
	CharString encoded_initial_url = initial_url.utf8();
	kirie_swift_create_webview(encoded_initial_url.get_data());
}

void KiriePlugin::destroyWebView() {
	kirie_swift_destroy_webview();
}

void KiriePlugin::loadUrl(String url) {
	CharString encoded_url = url.utf8();
	kirie_swift_load_url(encoded_url.get_data());
}

void KiriePlugin::loadHtmlString(String html, String base_url) {
	CharString encoded_html = html.utf8();
	CharString encoded_base_url = base_url.utf8();
	kirie_swift_load_html_string(encoded_html.get_data(), encoded_base_url.get_data());
}

void KiriePlugin::sendIpcMessage(String message_json) {
	CharString encoded_message_json = message_json.utf8();
	kirie_swift_send_ipc_message(encoded_message_json.get_data());
}

KiriePlugin *KiriePlugin::get_singleton() {
	return singleton;
}

Variant KiriePlugin::callp(const StringName &p_method, const Variant **p_args, int p_argcount, Callable::CallError &r_error) {
	r_error.error = Callable::CallError::CALL_OK;

	if (p_method == StringName("createWebView")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		createWebView(String(*p_args[0]));
		return Variant();
	}

	if (p_method == StringName("registerCallbacks")) {
		if (!require_arg_count(r_error, p_argcount, 3)) {
			return Variant();
		}

		registerCallbacks(Callable(*p_args[0]), Callable(*p_args[1]), Callable(*p_args[2]));
		return Variant();
	}

	if (p_method == StringName("destroyWebView")) {
		if (!require_arg_count(r_error, p_argcount, 0)) {
			return Variant();
		}

		destroyWebView();
		return Variant();
	}

	if (p_method == StringName("loadUrl")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		loadUrl(String(*p_args[0]));
		return Variant();
	}

	if (p_method == StringName("loadHtmlString")) {
		if (!require_arg_count(r_error, p_argcount, 2)) {
			return Variant();
		}

		loadHtmlString(String(*p_args[0]), String(*p_args[1]));
		return Variant();
	}

	if (p_method == StringName("sendIpcMessage")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		sendIpcMessage(String(*p_args[0]));
		return Variant();
	}

	return Object::callp(p_method, p_args, p_argcount, r_error);
}

KiriePlugin::KiriePlugin() {
	singleton = this;

	NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
	NSOperationQueue *main_queue = [NSOperationQueue mainQueue];

	webview_ready_observer = (__bridge_retained void *)[center addObserverForName:KirieWebViewReadyNotification
		object:nil
		queue:main_queue
		usingBlock:^(__unused NSNotification *notification) {
			if (singleton) {
				call_callback(singleton->webview_ready_callback);
			}
		}];

	ipc_message_received_observer = (__bridge_retained void *)[center addObserverForName:KirieIpcMessageReceivedNotification
		object:nil
		queue:main_queue
		usingBlock:^(NSNotification *notification) {
			if (singleton) {
				call_callback(singleton->ipc_message_received_callback, to_godot_string(notification.object));
			}
		}];

	ipc_error_observer = (__bridge_retained void *)[center addObserverForName:KirieIpcErrorNotification
		object:nil
		queue:main_queue
		usingBlock:^(NSNotification *notification) {
			if (singleton) {
				call_callback(singleton->ipc_error_callback, to_godot_string(notification.object));
			}
		}];
}

KiriePlugin::~KiriePlugin() {
	NSNotificationCenter *center = [NSNotificationCenter defaultCenter];

	if (webview_ready_observer) {
		id observer = (__bridge_transfer id)webview_ready_observer;
		[center removeObserver:observer];
		webview_ready_observer = nullptr;
	}

	if (ipc_message_received_observer) {
		id observer = (__bridge_transfer id)ipc_message_received_observer;
		[center removeObserver:observer];
		ipc_message_received_observer = nullptr;
	}

	if (ipc_error_observer) {
		id observer = (__bridge_transfer id)ipc_error_observer;
		[center removeObserver:observer];
		ipc_error_observer = nullptr;
	}

	singleton = nullptr;
}
