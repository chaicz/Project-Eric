class ReportsController < ApplicationController
  def show
    # A directory listing with a fixed, server-side path.
    output = `ls -l /var/reports`
    render plain: output
  end
end
