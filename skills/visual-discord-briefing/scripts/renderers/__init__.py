from renderers.daily_brief import render_daily_brief
from renderers.cover_card import render_cover_card
from renderers.hot_list import render_hot_list
from renderers.profile_card import render_profile_card
from renderers.weekly_digest import render_weekly_digest


RENDERER_REGISTRY = {
    "cover_card": render_cover_card,
    "daily_brief": render_daily_brief,
    "hot_list": render_hot_list,
    "profile_card": render_profile_card,
    "weekly_digest": render_weekly_digest,
}
