#include "KiriePlugin.h"

#import <Foundation/Foundation.h>

#include <cstdint>
#include <cstring>
#include <limits>

extern "C" void kirie_swift_create_webview(const char *initial_url);
extern "C" void kirie_swift_destroy_webview(void);
extern "C" void kirie_swift_load_url(const char *url);
extern "C" void kirie_swift_load_html_string(const char *html, const char *base_url);
extern "C" void kirie_swift_send_text_packet(const uint8_t *bytes, int32_t length);
extern "C" void kirie_swift_send_binary_packet(const uint8_t *bytes, int32_t length);
extern "C" void kirie_swift_send_data_packet(const uint8_t *bytes, int32_t length);

static NSString *const KirieWebViewReadyNotification = @"KirieWebViewReady";
static NSString *const KirieTextPacketReceivedNotification = @"KirieTextPacketReceived";
static NSString *const KirieBinaryPacketReceivedNotification = @"KirieBinaryPacketReceived";
static NSString *const KirieDataPacketReceivedNotification = @"KirieDataPacketReceived";
static NSString *const KirieIpcErrorNotification = @"KirieIpcError";

static KiriePlugin *singleton = nullptr;

static String to_godot_string(id value) {
	if (![value isKindOfClass:[NSString class]]) {
		return String();
	}

	return String::utf8([(NSString *)value UTF8String]);
}

static PackedByteArray to_godot_bytes(id value) {
	PackedByteArray bytes;
	if (![value isKindOfClass:[NSData class]]) {
		return bytes;
	}

	NSData *data = (NSData *)value;
	bytes.resize(data.length);
	if (data.length > 0) {
		memcpy(bytes.ptrw(), data.bytes, data.length);
	}

	return bytes;
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

static void call_callback(const Callable &callback, const PackedByteArray &value) {
	if (callback.is_null()) {
		return;
	}

	Variant argument = value;
	const Variant *arguments[] = { &argument };
	Variant return_value;
	Callable::CallError call_error;
	callback.callp(arguments, 1, return_value, call_error);
}

static void send_packet(PackedByteArray bytes, void (*send)(const uint8_t *, int32_t)) {
	ERR_FAIL_COND_MSG(bytes.size() > std::numeric_limits<int32_t>::max(), "Kirie packet is too large to send through the iOS bridge.");

	const int32_t byte_count = static_cast<int32_t>(bytes.size());
	send(bytes.ptr(), byte_count);
}

void KiriePlugin::registerCallbacks(
	Callable on_webview_ready,
	Callable on_text_packet_received,
	Callable on_binary_packet_received,
	Callable on_data_packet_received,
	Callable on_ipc_error
) {
	webview_ready_callback = on_webview_ready;
	text_packet_received_callback = on_text_packet_received;
	binary_packet_received_callback = on_binary_packet_received;
	data_packet_received_callback = on_data_packet_received;
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

void KiriePlugin::sendTextPacket(PackedByteArray bytes) {
	send_packet(bytes, kirie_swift_send_text_packet);
}

void KiriePlugin::sendBinaryPacket(PackedByteArray bytes) {
	send_packet(bytes, kirie_swift_send_binary_packet);
}

void KiriePlugin::sendDataPacket(PackedByteArray bytes) {
	send_packet(bytes, kirie_swift_send_data_packet);
}

String KiriePlugin::getLaunchOption(String key) {
	CharString encoded_key = key.utf8();
	NSString *underscore_key = [NSString stringWithUTF8String:encoded_key.get_data()];
	NSString *dash_key = [underscore_key stringByReplacingOccurrencesOfString:@"_" withString:@"-"];
	NSArray<NSString *> *arguments = [[NSProcessInfo processInfo] arguments];

	for (NSUInteger index = 0; index < arguments.count; index++) {
		NSString *argument = arguments[index];
		NSArray<NSString *> *option_names = @[ underscore_key, dash_key ];

		for (NSString *option_name in option_names) {
			NSString *prefix = [NSString stringWithFormat:@"--%@=", option_name];
			if ([argument hasPrefix:prefix]) {
				return to_godot_string([argument substringFromIndex:prefix.length]);
			}

			if ([argument isEqualToString:[NSString stringWithFormat:@"--%@", option_name]]
				&& index + 1 < arguments.count) {
				return to_godot_string(arguments[index + 1]);
			}
		}
	}

	return String();
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
		if (!require_arg_count(r_error, p_argcount, 5)) {
			return Variant();
		}

		registerCallbacks(
			Callable(*p_args[0]),
			Callable(*p_args[1]),
			Callable(*p_args[2]),
			Callable(*p_args[3]),
			Callable(*p_args[4])
		);
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

	if (p_method == StringName("sendTextPacket")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		sendTextPacket(PackedByteArray(*p_args[0]));
		return Variant();
	}

	if (p_method == StringName("sendBinaryPacket")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		sendBinaryPacket(PackedByteArray(*p_args[0]));
		return Variant();
	}

	if (p_method == StringName("sendDataPacket")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		sendDataPacket(PackedByteArray(*p_args[0]));
		return Variant();
	}

	if (p_method == StringName("getLaunchOption")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		return getLaunchOption(String(*p_args[0]));
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

	text_packet_received_observer = (__bridge_retained void *)[center addObserverForName:KirieTextPacketReceivedNotification
		object:nil
		queue:main_queue
		usingBlock:^(NSNotification *notification) {
			if (singleton) {
				call_callback(singleton->text_packet_received_callback, to_godot_bytes(notification.object));
			}
		}];

	binary_packet_received_observer = (__bridge_retained void *)[center addObserverForName:KirieBinaryPacketReceivedNotification
		object:nil
		queue:main_queue
		usingBlock:^(NSNotification *notification) {
			if (singleton) {
				call_callback(singleton->binary_packet_received_callback, to_godot_bytes(notification.object));
			}
		}];

	data_packet_received_observer = (__bridge_retained void *)[center addObserverForName:KirieDataPacketReceivedNotification
		object:nil
		queue:main_queue
		usingBlock:^(NSNotification *notification) {
			if (singleton) {
				call_callback(singleton->data_packet_received_callback, to_godot_bytes(notification.object));
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

	if (text_packet_received_observer) {
		id observer = (__bridge_transfer id)text_packet_received_observer;
		[center removeObserver:observer];
		text_packet_received_observer = nullptr;
	}

	if (binary_packet_received_observer) {
		id observer = (__bridge_transfer id)binary_packet_received_observer;
		[center removeObserver:observer];
		binary_packet_received_observer = nullptr;
	}

	if (data_packet_received_observer) {
		id observer = (__bridge_transfer id)data_packet_received_observer;
		[center removeObserver:observer];
		data_packet_received_observer = nullptr;
	}

	if (ipc_error_observer) {
		id observer = (__bridge_transfer id)ipc_error_observer;
		[center removeObserver:observer];
		ipc_error_observer = nullptr;
	}

	singleton = nullptr;
}
