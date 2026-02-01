# b2b/middleware/current_user.py
import threading

_thread_locals = threading.local()

def set_current_user(user):
    _thread_locals.user = user

def get_current_user():
    return getattr(_thread_locals, "user", None)

class CurrentUserMiddleware:
    """
    Stocke request.user dans un thread-local pour que les signals puissent savoir
    qui modifie quoi.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        set_current_user(getattr(request, "user", None))
        return self.get_response(request)
