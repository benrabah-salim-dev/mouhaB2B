# backend1/b2b/views/__init__.py
# -*- coding: utf-8 -*-

"""
NOTE:
Ne pas importer ici des APIViews / ViewSets (auth, fiches, etc.)
Sinon Django charge ces imports au démarrage et casse dès qu’on renomme une view.

Ce package sert uniquement à marquer b2b.views comme module.
Les imports doivent être faits directement dans urls.py.
"""
